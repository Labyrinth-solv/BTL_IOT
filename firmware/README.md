# 🛠️ HƯỚNG DẪN NẠP VÀ KIỂM THỬ FIRMWARE ESP32
> **Đề tài:** Hệ Thống Giám Sát & Điều Khiển Vi Khí Hậu Kho Ngũ Cốc Thông Minh (TCVN 8370:2018)  
> **Module phần cứng:** Node Cảm biến & Cơ cấu chấp hành Silo (`DEV_SILO_01`)

---

## 📌 1. Điểm Đặc Biệt: Chế Độ Kiểm Thử Chưa Cần Cắm Linh Kiện (Zero-Wiring Test Mode)

> 💡 **RẤT TIỆN LỢI CHO BẠN:**  
> Mã nguồn Firmware này đã được tích hợp cơ chế **tự động phát hiện phần cứng**:
> - Khi bạn **chỉ cắm duy nhất board ESP32 vào máy tính qua cáp USB** (chưa cần hàn hay nối dây cảm biến nào), firmware sẽ tự động phát hiện `!sht31.begin()` và chuyển sang **Chế độ Giả lập an toàn tại biên** (sinh dữ liệu đo 24°C, 61% RH, 400 ppm Gas).
> - **Mục đích:** Bạn có thể nạp code ngay lập tức, kiểm tra kết nối Wi-Fi, kết nối MQTT Broker, gửi Telemetry lên Dashboard và bấm thử bật quạt trên Web xem ESP32 nhận lệnh và phản hồi ACK như thế nào trước khi đấu nối dây vật lý!

---

## 🔌 2. Bảng Sơ Đồ Đấu Nối Chân GPIO (Hardware Pinout)

Khi bạn bắt đầu nối dây linh kiện, hãy đấu nối theo đúng sơ đồ chuẩn tại **Mục 6.1 của Đặc tả TCVN 8370**:

| STT | Linh Kiện | Chân Linh Kiện | Chân ESP32 (GPIO) | Ghi Chú Kỹ Thuật |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Cảm biến SHT31** (Nhiệt & Độ ẩm) | `VIN`<br>`GND`<br>`SDA`<br>`SCL` | `3V3`<br>`GND`<br>`GPIO 21`<br>`GPIO 22` | Giao tiếp I2C (Địa chỉ mặc định: `0x44`). Độ chính xác cao ±2% RH. |
| **2** | **Màn hình OLED 0.96"** (SSD1306) | `VCC`<br>`GND`<br>`SDA`<br>`SCL` | `3V3`<br>`GND`<br>`GPIO 21`<br>`GPIO 22` | Mắc song song chung đường Bus I2C với SHT31 (Địa chỉ: `0x3C`). |
| **3** | **Cảm biến MQ-135** (Khí Gas lên men) | `VCC`<br>`GND`<br>`A0 (Analog)` | `5V (VIN)`<br>`GND`<br>`GPIO 34` | Dùng kênh `ADC1_CH6` (GPIO 34) vì kênh ADC2 bị chiếm dụng khi bật Wi-Fi. |
| **4** | **Module Relay 5V** (Quạt thông gió) | `VCC`<br>`GND`<br>`IN` | `5V (VIN)`<br>`GND`<br>`GPIO 26` | Kích hoạt quạt DC 5V/12V qua tiếp điểm COM - NO. |
| **5** | **Còi Buzzer chủ động** | `(+)`<br>`(-)` | `GPIO 25`<br>`GND` | Báo động khi nồng độ khí gas hoặc nhiệt ẩm vượt ngưỡng `HIGH_RISK`. |
| **6** | **LED Xanh (SAFE)** | Anode (+)<br>Cathode (-) | `GPIO 14`<br>`GND` | Nối tiếp qua điện trở `220 Ω` về GND. Sáng khi kho an toàn. |
| **7** | **LED Vàng (WARNING)** | Anode (+)<br>Cathode (-) | `GPIO 27`<br>`GND` | Nối tiếp qua điện trở `220 Ω` về GND. Sáng khi cảnh báo ẩm. |
| **8** | **LED Đỏ (HIGH RISK)** | Anode (+)<br>Cathode (-) | `GPIO 12`<br>`GND` | Nối tiếp qua điện trở `220 Ω` về GND. Sáng khi nguy hiểm cao. |

---

## ⚙️ 3. Cấu Hình Trước Khi Nạp (File `config.h`)

Trước khi nạp mã nguồn, hãy mở file `config.h` (trong thư mục `src/config.h` hoặc `esp32_grain_node/config.h`) để chỉnh sửa 2 thông số sau:

```cpp
// 1. Tên và mật khẩu mạng Wi-Fi (Lưu ý: Dùng Wi-Fi 2.4GHz)
#define WIFI_SSID           "Tên_WiFi_Của_Bạn"
#define WIFI_PASSWORD       "Mat_Khau_WiFi"

// 2. Địa chỉ IP của máy tính đang chạy Docker MQTT Mosquitto (PORT 1883)
// Để xem IP máy tính: Mở CMD gõ "ipconfig" -> tìm dòng IPv4 Address (VD: 192.168.1.15)
#define MQTT_SERVER_IP      "192.168.1.15"  // Thay bằng IP máy bạn
#define MQTT_SERVER_PORT    1883
```

---

## 🚀 4. Hướng Dẫn Nạp Code Lên ESP32

Bạn có thể lựa chọn 1 trong 2 cách nạp phổ biến nhất dưới đây:

### 🌟 Cách 1: Nạp bằng Arduino IDE (Đơn giản nhất)
1. Mở phần mềm **Arduino IDE**.
2. Cài đặt Board ESP32 (nếu chưa có):
   - Vào `File` &rarr; `Preferences` &rarr; dán link sau vào mục *Additional Boards Manager URLs*:  
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Vào `Tools` &rarr; `Board` &rarr; `Boards Manager` &rarr; Tìm **esp32** và bấm **Install**.
3. Cài đặt các thư viện cần thiết qua `Tools` &rarr; `Manage Libraries...`:
   - `PubSubClient` (tác giả Nick O'Leary)
   - `ArduinoJson` (tác giả Benoit Blanchon)
   - `Adafruit SHT31 Library` (Adafruit)
   - `Adafruit SSD1306` (Adafruit)
   - `Adafruit GFX Library` (Adafruit)
4. Mở file: `firmware/esp32_grain_node/esp32_grain_node.ino`.
5. Chọn Board và Cổng COM:
   - `Tools` &rarr; `Board` &rarr; `esp32` &rarr; **DOIT ESP32 DEVKIT V1** (hoặc ESP32 Dev Module).
   - `Tools` &rarr; `Port` &rarr; Chọn cổng COM của mạch ESP32.
6. Bấm nút **Upload** (Mũi tên tròn `->`) để nạp code.
7. Mở **Serial Monitor** (tốc độ `115200 baud`) để xem thông báo kết nối.

---

### ⚡ Cách 2: Nạp bằng PlatformIO (VS Code)
1. Mở thư mục `firmware/` bằng phần mềm **VS Code** có cài extension **PlatformIO IDE**.
2. PlatformIO sẽ tự động tải tất cả các thư viện định nghĩa trong `platformio.ini`.
3. Cắm cáp USB nối ESP32 với máy tính.
4. Bấm biểu tượng dấu tích `✓` (**PlatformIO: Build**) để biên dịch.
5. Bấm biểu tượng mũi tên `→` (**PlatformIO: Upload**) để nạp vào ESP32.
6. Bấm biểu tượng hình phích cắm (**PlatformIO: Serial Monitor**) để theo dõi log ở tốc độ 115200.

---

## 📊 5. Kiểm Tra Hoạt Động Cùng Hệ Thống

1. Khi ESP32 khởi động, đèn LED Xanh sẽ sáng, Serial Monitor in ra:
   ```text
   ========================================================
   🌾 SMART GRAIN STORAGE IOT NODE - DEV_SILO_01 (TCVN 8370)
   Firmware v1.0.2 | Hardware: ESP32-WROOM-32-v1
   ========================================================
   📡 [Wi-Fi] Ket noi thanh cong! IP: 192.168.1.xxx
   🔌 [MQTT] Dang ket noi toi Broker: 192.168.1.15:1883...
   ✅ [MQTT] Ket noi MQTT Broker thanh cong!
   📡 [MQTT] Da subscribe topic dieu khien: grain/devices/DEV_SILO_01/cmd
   📡 [MQTT] Da phat ban tin Heartbeat ONLINE len grain/devices/DEV_SILO_01/status
   ```
2. Mở trình duyệt Web `http://localhost:5173`:
   - Thẻ Silo A1 lập tức chuyển sang chấm xanh **`ONLINE`**.
   - Cứ mỗi 3 giây, số đo nhiệt ẩm, EMC, khí gas được cập nhật trực tiếp từ ESP32.
3. **Thử điều khiển quạt thật từ Web:**
   - Trên Web Dashboard, bấm bật công tắc **Quạt thông gió**.
   - ESP32 nhận lệnh qua MQTT `/cmd`, đổi chân `GPIO 26` lên mức `HIGH`, in ra Serial:
     `📥 [MQTT Command] Nhan lenh tu topic: ...`
     `📤 [MQTT ACK] Da gui phan hoi ACK: Relay GPIO 26 switched HIGH`
   - Quạt trên Web chuyển sang **BẬT (ON)** ngay sau khi nhận ACK từ ESP32!
