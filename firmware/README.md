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

## 🔌 2. Bảng Sơ Đồ Đấu Nối Chân GPIO (Hardware Pinout Chính Thức)

Khi đấu nối phần cứng trên Breadboard với Nguồn tổ ong 5V-5A, hãy đấu nối theo đúng bảng chuẩn sau:

| STT | Linh Kiện | Chân Linh Kiện | Chân ESP32 (GPIO) | Ghi Chú Kỹ Thuật |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Cảm biến AHT20** (Nhiệt & Độ ẩm) | `VIN`<br>`GND`<br>`SDA`<br>`SCL` | `3V3`<br>`GND`<br>`GPIO 21`<br>`GPIO 22` | Giao tiếp I2C (Địa chỉ: `0x38`). Nguồn 3.3V lấy từ ESP32. |
| **2** | **Cảm biến MQ-135** (Khí Gas lên men) | `VCC`<br>`GND`<br>`A0 (Analog)` | `5V (Nguồn tổ ong)`<br>`GND`<br>`GPIO 34` | Đưa chân AO qua **cầu chia áp 15kΩ + 10kΩ** vào `GPIO 34` (ADC1). |
| **3** | **Cảm biến từ cửa** (Hall / Reed Switch) | `VCC`<br>`GND`<br>`D0` | `3V3`<br>`GND`<br>`GPIO 27` | Theo dõi đóng/mở cửa kho Silo. |
| **4** | **Module Relay 2 kênh 5V** | `VCC`<br>`GND`<br>`IN1 (Quạt 5V)`<br>`IN2 (Còi 5V)` | `5V (Nguồn tổ ong)`<br>`GND`<br>`GPIO 25`<br>`GPIO 33` | Kênh 1 (`COM1-NO1`) đóng ngắt Quạt 5V.<br>Kênh 2 (`COM2-NO2`) đóng ngắt Còi 5V. |
| **5** | **ESP32-WROOM-32D** | `VIN / 5V`<br>`GND` | `Nguồn 5V tổ ong`<br>`GND chung` | Mọi chân `GND` của tất cả module phải nối chung với `V-` nguồn tổ ong. |

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
3. Cài đặt 3 thư viện cần thiết qua `Tools` &rarr; `Manage Libraries...`:
   - `PubSubClient` (tác giả Nick O'Leary)
   - `ArduinoJson` (tác giả Benoit Blanchon)
   - `Adafruit AHTX0` (tác giả Adafruit)
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
   - ESP32 nhận lệnh qua MQTT `/cmd`, kích hoạt Relay 1 (`GPIO 25`), in ra Serial:
     `📥 [MQTT Command] Nhan lenh tu topic: ...`
     `📤 [MQTT ACK] Da gui phan hoi ACK: Relay 1 (GPIO 25) da BAT Quat thong gio`
   - Quạt trên Web chuyển sang **BẬT (ON)** ngay sau khi nhận ACK từ ESP32!
