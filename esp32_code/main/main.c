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
#include "driver/rmt_tx.h"

#define LED_PIN 2
#define CKP_GPIO 4
#define ENGINE_PIN 18

static volatile bool is_connected = false;
static uint8_t svc_uuid[16] = {0xf0,0xde,0xbc,0x9a,0x78,0x56,0x34,0x12,0xf0,0xde,0xbc,0x9a,0x78,0x56,0x34,0x12};

typedef struct { uint16_t rpm; uint8_t total; uint8_t missing; bool engine; } ecu_cfg_t;
ecu_cfg_t cfg = { .rpm = 1000, .total = 60, .missing = 2, .engine = false };
rmt_channel_handle_t rmt_chan = NULL;

void update_ckp() {
    if (!rmt_chan) return;
    if (!cfg.engine || cfg.rpm < 50) { rmt_disable(rmt_chan); return; }
    uint32_t us = (60000000 / cfg.rpm) / cfg.total;
    uint32_t h = us / 2;
    int act = cfg.total - cfg.missing;
    static rmt_symbol_word_t syms[256];
    for (int i = 0; i < act; i++) syms[i] = (rmt_symbol_word_t) { .duration0 = h, .level0 = 1, .duration1 = h, .level1 = 0 };
    syms[act] = (rmt_symbol_word_t) { .duration0 = 0, .level0 = 0, .duration1 = us * cfg.missing, .level1 = 0 };
    rmt_transmit_config_t tx_cfg = { .loop_count = -1 };
    static rmt_encoder_handle_t enc = NULL;
    if (!enc) { rmt_copy_encoder_config_t ec = {}; rmt_new_copy_encoder(&ec, &enc); }
    rmt_disable(rmt_chan); rmt_enable(rmt_chan);
    rmt_transmit(rmt_chan, enc, syms, sizeof(rmt_symbol_word_t) * (act + 1), &tx_cfg);
}

static void gatts_cb(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    if (event == ESP_GATTS_CONNECT_EVT) is_connected = true;
    else if (event == ESP_GATTS_DISCONNECT_EVT) {
        is_connected = false;
        esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){ .adv_int_min = 0x20, .adv_int_max = 0x40, .adv_type = ADV_TYPE_IND, .own_addr_type = BLE_ADDR_TYPE_PUBLIC, .channel_map = ADV_CHNL_ALL, .adv_filter_policy = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY });
    }
    else if (event == ESP_GATTS_WRITE_EVT && param->write.len >= 5) {
        uint8_t *d = param->write.value;
        cfg.rpm = (d[0] << 8) | d[1]; cfg.total = d[2]; cfg.missing = d[3]; cfg.engine = (d[4] != 0);
        gpio_set_level(ENGINE_PIN, cfg.engine); update_ckp();
        if (param->write.need_rsp) esp_ble_gatts_send_response(gatts_if, param->write.conn_id, param->write.trans_id, ESP_GATT_OK, NULL);
    }
    else if (event == ESP_GATTS_REG_EVT) {
        esp_ble_gatts_create_service(gatts_if, &(esp_gatt_srvc_id_t){ .is_primary = true, .id.uuid.len = ESP_UUID_LEN_128, .id.uuid.uuid.uuid128 = {0xf0,0xde,0xbc,0x9a,0x78,0x56,0x34,0x12,0xf0,0xde,0xbc,0x9a,0x78,0x56,0x34,0x12} }, 4);
    }
    else if (event == ESP_GATTS_CREATE_EVT) {
        esp_ble_gatts_start_service(param->create.service_handle);
        esp_ble_gatts_add_char(param->create.service_handle, &(esp_bt_uuid_t){ .len = ESP_UUID_LEN_128, .uuid.uuid128 = {0x10,0x0f,0x0e,0x0d,0x0c,0x0b,0x0a,0x09,0x08,0x07,0x06,0x05,0x04,0x03,0x02,0x01} }, ESP_GATT_PERM_WRITE, ESP_GATT_CHAR_PROP_BIT_WRITE | ESP_GATT_CHAR_PROP_BIT_WRITE_NR, NULL, NULL);
    }
}

void led_task(void *p) {
    gpio_reset_pin(LED_PIN); gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    while(1) { gpio_set_level(LED_PIN, 1); vTaskDelay(pdMS_TO_TICKS(100)); gpio_set_level(LED_PIN, 0); vTaskDelay(pdMS_TO_TICKS(is_connected ? 1000 : 3000)); }
}

void app_main(void) {
    nvs_flash_init();
    xTaskCreate(&led_task, "led", 2048, NULL, 5, NULL);
    vTaskDelay(pdMS_TO_TICKS(2000));
    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    esp_bt_controller_init(&bt_cfg);
    esp_bt_controller_enable(ESP_BT_MODE_BLE);
    esp_bluedroid_init(); esp_bluedroid_enable();
    esp_ble_gatts_register_callback(gatts_cb);
    esp_ble_gatts_app_register(0);
    esp_ble_gap_set_device_name("PRO-ECU-TESTER");
    esp_ble_gap_config_adv_data(&(esp_ble_adv_data_t){ .set_scan_rsp = false, .include_name = true, .include_txpower = true, .min_interval = 0x0006, .max_interval = 0x0010, .flag = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT), .service_uuid_len = 16, .p_service_uuid = svc_uuid });
    esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){ .adv_int_min = 0x20, .adv_int_max = 0x40, .adv_type = ADV_TYPE_IND, .own_addr_type = BLE_ADDR_TYPE_PUBLIC, .channel_map = ADV_CHNL_ALL, .adv_filter_policy = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY });
    gpio_reset_pin(ENGINE_PIN); gpio_set_direction(ENGINE_PIN, GPIO_MODE_OUTPUT);
    rmt_tx_channel_config_t rc = { .clk_src = RMT_CLK_SRC_DEFAULT, .gpio_num = CKP_GPIO, .mem_block_symbols = 64, .resolution_hz = 1000000, .trans_queue_depth = 4 };
    rmt_new_tx_channel(&rc, &rmt_chan);
}
