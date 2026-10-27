# 🌾 HƯỚNG DẪN CHẠY DEMO NHANH HỆ THỐNG SMART GRAIN STORAGE IOT
> **Đề tài:** Hệ Thống Giám Sát & Bảo Quản Vi Khí Hậu Kho Ngũ Cốc Thông Minh (TCVN 8370:2018)  
> **Dành cho:** Thành viên nhóm thuyết trình & kiểm thử hệ thống.

---

## 📌 1. Yêu Cầu Cài Đặt Trước (Prerequisites)

Đảm bảo máy tính của bạn đã cài:
1. **Node.js** (Khuyên dùng v18 hoặc v20 trở lên).
2. **Docker Desktop** (Đang được bật và chạy ở chế độ nền).
3. **Git**.

---

## 🚀 2. Cài Đặt Lần Đầu (Chỉ cần làm 1 lần duy nhất)

Mở **PowerShell** hoặc **Terminal** tại thư mục gốc của dự án (`d:\Work\BTL_IOT`):

### Bước 2.1: Cài đặt thư viện dependencies
```powershell
# Cài thư viện Backend & Simulator
npm install

# Cài thư viện Frontend giao diện
cd frontend
npm install
cd ..
```

### Bước 2.2: Tạo file cấu hình môi trường `.env`
Kiểm tra xem ở thư mục gốc đã có file `.env` chưa. Nếu chưa có, copy từ `.env.example`:
```powershell
cp .env.example .env
```

### Bước 2.3: Khởi động Docker (Database PostgreSQL & MQTT Mosquitto)
> ⚠️ **Lưu ý:** Hãy chắc chắn phần mềm **Docker Desktop** đang chạy trước khi gõ lệnh này!
```powershell
npm run docker:up
```

### Bước 2.4: Khởi tạo bảng dữ liệu và nạp dữ liệu mẫu ban đầu
```powershell
npm run db:push
npm run db:seed
```
*(Lệnh `db:seed` sẽ tự động tạo sẵn 2 khu vực kho Silo A1, B2 và 2 node cảm biến `DEV_SILO_01`, `DEV_SILO_02`).*

---

## 💻 3. Các Bước Khởi Chạy Hệ Thống Khi Demo

Để hệ thống hoạt động đầy đủ tính năng thời gian thực, bạn cần mở **3 cửa sổ Terminal** riêng biệt:

### 🟢 Terminal 1: Khởi chạy Backend Server (Port 4000)
```powershell
npm run dev
```
*(Backend sẽ lắng nghe tại `http://localhost:4000`, kết nối Postgres và MQTT Broker).*

### 🟡 Terminal 2: Khởi chạy Bộ Giả Lập Phần Cứng Simulator (Port 4001 & MQTT)
```powershell
npm run simulator
```
*(Simulator sẽ đóng vai trò là mạch ESP32 ảo `DEV_SILO_01`, tự động phát gói tin vi khí hậu mỗi 3 giây và phản hồi lệnh quạt sau 300ms).*

### 🔵 Terminal 3: Khởi chạy Giao diện Web Frontend (Port 5173)
```powershell
npm run frontend:dev
```
*(Vite Dev Server sẽ khởi chạy tại `http://localhost:5173`).*

---

## 🌐 4. Mở Ứng Dụng Trên Trình Duyệt

Mở Google Chrome / Edge và truy cập:
👉 **[http://localhost:5173](http://localhost:5173)**

Hệ thống đã được bật **Chế độ Demo Tự Do (Full-Access Demo Mode)**:
- Giao diện tự động vào thẳng **Dashboard Tổng quan**.
- Không bị chặn bởi 403 Forbidden hay giới hạn tài khoản.
- Mọi nút bấm, điều khiển quạt và giả lập đều sẵn sàng hoạt động ngay lập tức.

---

## 🎬 5. Kịch Bản Thuyết Trình Demo Mẫu (Từ 5 - 7 Phút)

| Bước | Tên tính năng | Thao tác thực hiện trên Web | Điểm nhấn cần nói khi thuyết trình |
| :---: | :--- | :--- | :--- |
| **1** | **Dashboard & Chuẩn TCVN 8370** | Mở trang **Dashboard Tổng quan**. | - 4 thẻ KPI đo đạc vi khí hậu: Tổng thiết bị, Cảnh báo chưa xử lý, Độ ẩm hạt ước tính theo **Mô hình Halsey (EMC %MC &le; 14.0%)**, và số lượng quạt đang chạy.<br>- Thẻ Silo A1 hiển thị trực quan: Nhiệt độ, Độ ẩm không khí (%RH), EMC (%MC), Khí Gas MQ-135 (ppm). |
| **2** | **Điều khiển Quạt thông gió & Phản hồi ACK** | Bấm vào **công tắc Quạt** ở góc dưới bên trái của thẻ Silo A1. | - Khi bấm gạt quạt, hệ thống hiện chữ vàng nhấp nháy: `Chờ phản hồi Pending ACK... → Active`.<br>- Sau **300ms**, Simulator ESP32 gửi bản tin xác nhận (`grain/devices/DEV_SILO_01/ack`) &rarr; Quạt chuyển sang màu vàng cam/xanh **BẬT (ON)**, cánh quạt quay tròn và hiện thông báo Toast thành công! |
| **3** | **Biểu đồ thời gian thực & Xuất báo cáo CSV** | Bấm nút **"Chi tiết & Biểu đồ"** trên thẻ Silo A1. | - Biểu đồ đa trục **Recharts** vẽ các đường Nhiệt độ, Độ ẩm RH, EMC cập nhật thời gian thực từng giây qua WebSocket.<br>- Thống kê tự động **Min / Max / Avg** vi khí hậu.<br>- Có nút bật/tắt quạt nhanh ngay góc trên cùng.<br>- Bấm nút **"Xuất Báo Cáo CSV"** để tải file Excel/CSV số liệu lịch sử phục vụ kiểm toán kho lương thực. |
| **4** | **Kích hoạt sự cố Lên men ẩm mốc (Hardware Simulator Drawer)** | Bấm nút màu vàng **"Hardware Simulator"** ở góc trên bên phải màn hình. | - Bấm kích hoạt **Kịch bản 3: Lên men sinh nhiệt & khí gas (>850 ppm)**.<br>- Ngay lập tức quan sát Dashboard: Nồng độ Gas vọt lên >1000 ppm, nhãn rủi ro nhảy sang màu đỏ **`HIGH RISK`**.<br>- **Rule Engine tự động:** Hệ thống tự động kích hoạt bật Quạt thông gió đối lưu để tản nhiệt ẩm.<br>- Cảnh báo đỏ nghiêm trọng **`GAS_SPIKE (CRITICAL)`** lập tức xuất hiện! |
| **5** | **Xử lý sự cố theo Quy trình SOP** | Bấm vào menu **"Trung tâm Cảnh báo"** ở thanh bên trái. | - Cảnh báo mới sinh ra ở trạng thái `NEW`.<br>- Bấm **"Xác nhận (ACK)"** &rarr; Nhập ghi chú tiếp nhận của thủ kho.<br>- Bấm **"Hoàn tất (Resolve)"** &rarr; Nhập ghi chú kết quả xử lý và đóng cảnh báo. |
| **6** | **Kiểm thử mất mạng đột ngột (Last Will & Testament - LWT)** | Mở lại ngăn kéo **Hardware Simulator**, bấm **Kịch bản 4: Mất mạng đột ngột**. | - Thiết bị ngắt socket TCP đột ngột. Broker Mosquitto tự động phát bản tin LWT.<br>- Giao diện lập tức chuyển sang chấm đỏ **`OFFLINE`** và phát sinh cảnh báo thiết bị mất kết nối.<br>- Bấm nút **"Phục hồi kết nối (Reconnect)"** trong ngăn kéo &rarr; Thiết bị online trở lại. |
| **7** | **Quản lý Vòng đời & Onboard Thiết bị Mới** | Vào menu **"Quản lý Thiết bị"**. | - Xem quy trình FSM vòng đời thiết bị (Registered &rarr; Active &rarr; Maintenance / Suspended &rarr; Decommissioned).<br>- Bấm **"Onboard Thiết bị Mới"** &rarr; Điền mã `DEV_SILO_03` &rarr; Popup hiện **Secret Token duy nhất 1 lần** kèm nút Copy an toàn. |
| **8** | **Nhật ký Kiểm toán Hệ thống (Audit Logs)** | Vào menu **"Nhật ký Audit Logs"**. | - Toàn bộ mọi hành vi can thiệp điều khiển quạt, onboard thiết bị, chuyển trạng thái cảnh báo đều được ghi vết bất biến kèm IP và Payload JSON. |

---

## 🛠️ 6. Xử Lý Các Sự Cố Thường Gặp (Troubleshooting)

### ❓ 1. Màn hình Dashboard hiện "0 nodes" (Không thấy thiết bị Silo)
- **Cách khắc phục:** 
  1. Đảm bảo Backend ở Terminal 1 đang chạy không có lỗi.
  2. Bấm nút **"Làm mới"** ở góc trên bên phải Dashboard (hoặc nhấn `F5` trên trình duyệt).
  3. Nếu DB trống, chạy lại lệnh: `npm run db:seed`.

### ❓ 2. Lệnh Docker báo lỗi "open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified"
- **Nguyên nhân:** Phần mềm Docker Desktop chưa được mở.
- **Cách khắc phục:** Mở ứng dụng **Docker Desktop** trên Windows, đợi icon Docker chuyển sang màu xanh lá (Engine running), sau đó gõ lại `npm run docker:up`.

### ❓ 3. Lỗi cổng đang bị chiếm (Port 4000 hoặc 5173 EADDRINUSE)
- **Cách khắc phục:** Đóng tất cả terminal Node đang chạy nền hoặc gõ lệnh PowerShell để dọn dẹp tiến trình cũ:
```powershell
Get-Process -Name node | Stop-Process -Force
```
Sau đó khởi động lại 3 terminal như Mục 3.

---

> 👥 **Ghi chú sao lưu:** Toàn bộ bản gốc có phân quyền tài khoản nghiêm ngặt RBAC được lưu an toàn tại nhánh Git `backup-rbac`. Nếu cần chuyển đổi lại, chỉ cần gõ: `git checkout backup-rbac`.
