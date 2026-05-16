# Probador de ECU Vehicular

Este proyecto es un sistema para probar unidades de control electrónico (ECUs) vehiculares. Consta de dos componentes principales:

1. **Firmware ESP32 (`esp32_code`):** Código escrito en ESP-IDF para un microcontrolador ESP32 WROOM-32. Implementa comunicación Bluetooth (Bluedroid), generación de señales (como simulación de RPM) y control de hardware básico.
2. **Aplicación Web (`web_app`):** Un panel de control o *Dashboard* "Premium" que se conecta al ESP32 a través de la Web Bluetooth API. Muestra indicadores, un tacómetro en tiempo real y permite enviar comandos a la placa.

## Estado Actual
- **Hardware Target:** ESP32 WROOM-32
- **Framework:** ESP-IDF
- **Comunicación:** Bluetooth Classic / BLE (vía Web Bluetooth)

## Estructura del Proyecto
- `esp32_code/` - Código fuente en C para ESP-IDF.
- `web_app/` - Archivos HTML, CSS y JS para el dashboard.
