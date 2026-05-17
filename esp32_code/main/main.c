#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_bt_device.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_task_wdt.h"

#define LED_PIN 2 // Pin del LED azul en la mayoría de placas ESP32
#define CKP_PIN 4 // Pin de salida para la señal CKP (GPIO 4)

static volatile bool is_connected = false;
static volatile uint32_t current_rpm = 0;
static volatile uint8_t current_signal = 0;
static volatile uint8_t ckp_teeth = 60;
static volatile uint8_t ckp_missing = 2;

// UUIDs configurados para que coincidan con la Web App
// SERVICE_UUID: 12345678-9abc-def0-1234-56789abcdef0
// CHAR_UUID: 01020304-0506-0708-090a-0b0c0d0e0f10
static uint8_t svc_uuid[16] = {0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12}; // Inverso de 12345678-9abc-def0-1234-56789abcdef0

static esp_ble_adv_params_t adv_params = {
    .adv_int_min        = 0x20,
    .adv_int_max        = 0x40,
    .adv_type           = ADV_TYPE_IND,
    .own_addr_type      = BLE_ADDR_TYPE_PUBLIC,
    .channel_map        = ADV_CHNL_ALL,
    .adv_filter_policy  = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY,
};

static void gatts_profile_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    switch (event) {
        case ESP_GATTS_REG_EVT:
            ESP_LOGI("BLE", "Registrando Servicio");
            esp_ble_gap_set_device_name("PRO-ECU-TESTER");
            esp_ble_gap_config_adv_data(&(esp_ble_adv_data_t){
                .set_scan_rsp = false,
                .include_name = true,
                .include_txpower = true,
                .min_interval = 0x0006,
                .max_interval = 0x0010,
                .flag = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT),
                .service_uuid_len = 16,
                .p_service_uuid = svc_uuid
            });
            esp_ble_gatts_create_service(gatts_if, &(esp_gatt_srvc_id_t){
                .is_primary = true,
                .id.uuid.len = ESP_UUID_LEN_128,
                .id.uuid.uuid.uuid128 = {0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12}
            }, 4);
            break;
        case ESP_GATTS_CREATE_EVT:
            ESP_LOGI("BLE", "Servicio Creado");
            esp_ble_gatts_start_service(param->create.service_handle);
            esp_ble_gatts_add_char(param->create.service_handle, &(esp_bt_uuid_t){
                .len = ESP_UUID_LEN_128,
                .uuid.uuid128 = {0x10, 0x0f, 0x0e, 0x0d, 0x0c, 0x0b, 0x0a, 0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01}
            }, ESP_GATT_PERM_WRITE, ESP_GATT_CHAR_PROP_BIT_WRITE | ESP_GATT_CHAR_PROP_BIT_WRITE_NR, NULL, NULL);
            break;
        case ESP_GATTS_CONNECT_EVT:
            ESP_LOGI("BLE", "Dispositivo Conectado!");
            is_connected = true;
            break;
        case ESP_GATTS_DISCONNECT_EVT:
            ESP_LOGI("BLE", "Dispositivo Desconectado. Reiniciando Advertising...");
            is_connected = false;
            esp_ble_gap_start_advertising(&adv_params);
            break;
        case ESP_GATTS_WRITE_EVT:
            if (param->write.len >= 3) {
                uint16_t rpm = param->write.value[0] | (param->write.value[1] << 8);
                uint8_t signal_id = param->write.value[2];
                uint8_t teeth = 60;
                uint8_t missing = 2;
                
                if (param->write.len >= 5) {
                    teeth = param->write.value[3];
                    missing = param->write.value[4];
                }
                
                current_rpm = rpm;
                current_signal = signal_id;
                ckp_teeth = teeth;
                ckp_missing = missing;
                
                ESP_LOGI("BLE", "Datos Recibidos: RPM=%d, Senal=%d, Dientes=%d, Faltantes=%d", rpm, signal_id, teeth, missing);
            }
            if (param->write.need_rsp) {
                esp_ble_gatts_send_response(gatts_if, param->write.conn_id, param->write.trans_id, ESP_GATT_OK, NULL);
            }
            break;
        default:
            break;
    }
}

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
    switch (event) {
        case ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT:
            esp_ble_gap_start_advertising(&adv_params);
            break;
        default:
            break;
    }
}

// Tarea principal del "Latido"
void heartbeat_task(void *pvParameters) {
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);

    while(1) {
        if (!is_connected) {
            // OFFLINE: Destello simple cada 3 segundos
            gpio_set_level(LED_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(100)); // Prende corto
            gpio_set_level(LED_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(2900)); // Apaga largo
        } else {
            // ONLINE: Doble destello ULTRA-RÁPIDO tipo "Latido" cada 1 segundo
            gpio_set_level(LED_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(50));
            gpio_set_level(LED_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(50));
            gpio_set_level(LED_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(50));
            gpio_set_level(LED_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(850));
        }
    }
}

// Retraso híbrido de alta precisión: duerme la tarea si la espera es larga (para NVS/Bluetooth/Watchdog),
// pero utiliza esperas activas de microsegundos para la fracción final para garantizar CERO jitter.
static inline void precise_delay_us(uint64_t microseconds) {
    if (microseconds >= 2000) { // Si el retraso es mayor a 2ms
        uint32_t ms_to_sleep = (microseconds / 1000) - 1; // Deja 1ms para remanente de alta precisión
        if (ms_to_sleep > 0) {
            vTaskDelay(pdMS_TO_TICKS(ms_to_sleep));
            microseconds -= (ms_to_sleep * 1000);
        }
    }
    esp_rom_delay_us(microseconds);
}

// Tarea generadora de señal CKP y auxiliares con precisión de microsegundos y estabilidad absoluta
void ckp_generator_task(void *pvParameters) {
    // 1. Desvincular esta tarea del Watchdog del Sistema (TWDT) para evitar reinicios por bucles rápidos
    esp_task_wdt_delete(NULL);

    gpio_reset_pin(CKP_PIN);
    gpio_set_direction(CKP_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(CKP_PIN, 0);

    ESP_LOGI("CKP", "Generador CKP Inicializado con estabilidad absoluta en GPIO %d", CKP_PIN);

    while (1) {
        uint32_t rpm = current_rpm;
        uint8_t signal = current_signal;
        uint32_t teeth = ckp_teeth;
        uint32_t missing = ckp_missing;

        if (rpm == 0 || teeth == 0) {
            // Motor apagado: CKP en nivel bajo y esperamos
            gpio_set_level(CKP_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }

        // Calcular el tiempo de una rotación en microsegundos
        // 1 minuto = 60,000,000 microsegundos
        uint64_t rotation_time_us = 60000000ULL / rpm;

        // Tiempo por cada diente (incluyendo su espacio vacío)
        uint64_t tooth_time_us = rotation_time_us / teeth;
        uint64_t half_tooth_us = tooth_time_us / 2;

        if (signal == 0) {
            // --- SEÑAL CKP (Crankshaft con Dientes Faltantes) ---
            for (uint32_t i = 0; i < teeth; i++) {
                if (i >= (teeth - missing)) {
                    // Dientes faltantes (Gap): Mantiene la señal en LOW
                    gpio_set_level(CKP_PIN, 0);
                    precise_delay_us(tooth_time_us);
                } else {
                    // Diente normal: onda cuadrada (HIGH la mitad, LOW la otra mitad)
                    gpio_set_level(CKP_PIN, 1);
                    precise_delay_us(half_tooth_us);
                    gpio_set_level(CKP_PIN, 0);
                    precise_delay_us(half_tooth_us);
                }
            }
        } else {
            // --- OTRAS SEÑALES (AUX / HALL / CMP simples) ---
            // Genera una señal cuadrada simple de 50% de ciclo de trabajo por vuelta
            gpio_set_level(CKP_PIN, 1);
            precise_delay_us(tooth_time_us / 2);
            gpio_set_level(CKP_PIN, 0);
            precise_delay_us(tooth_time_us / 2);
        }

        // Ceder el CPU por un instante al finalizar cada vuelta completa de cigüeñal
        // para mantener al planificador de FreeRTOS 100% estable y evitar colisiones de contexto
        taskYIELD();
    }
}

void app_main(void) {
    // 1. Iniciar NVS (necesario para Bluetooth)
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // 2. Iniciar la tarea del latido de corazón
    xTaskCreate(&heartbeat_task, "heartbeat", 2048, NULL, 5, NULL);

    // 2.5 Iniciar la tarea de generación de señal CKP (anclada al Core 1 con alta prioridad)
    xTaskCreatePinnedToCore(&ckp_generator_task, "ckp_generator", 4096, NULL, 10, NULL, 1);

    // 3. Configurar e iniciar Bluetooth (Bluedroid)
    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    esp_bt_controller_init(&bt_cfg);
    esp_bt_controller_enable(ESP_BT_MODE_BLE);
    esp_bluedroid_init();
    esp_bluedroid_enable();

    // 4. Registrar Callbacks
    esp_ble_gatts_register_callback(gatts_profile_event_handler);
    esp_ble_gap_register_callback(gap_event_handler);
    esp_ble_gatts_app_register(0); // Registra el perfil ID 0
}
