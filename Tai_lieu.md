Tài liệu Đặc tả Kỹ thuật và Kiến trúc Hệ thống IoT Giám sát Bảo quản Kho Ngũ cốc (Master Spec & AI Context)
Tài liệu đặc tả kỹ thuật (System Specification & Context Document) này được thiết kế chuyên biệt cho đề tài Hệ thống Giám sát và Điều khiển Vi khí hậu Bảo quản Kho Ngũ cốc (Smart Grain Storage Monitoring & Preservation System) thuộc học phần IoT và Ứng dụng1. Do nhóm hiện chưa có thiết bị phần cứng vật lý nhưng cần triển khai ngay giao diện Web để theo dõi, kiểm thử nghiệp vụ và kịp tiến độ kiểm tra giữa kỳ (dự kiến 28/10/2026 hoặc 04/11/2026) cũng như thuyết trình (04/11/2026, 11/11/2026 và 18/11/2026)1, tài liệu này áp dụng kiến trúc Mock-First, Hardware-Ready (Ưu tiên giả lập – Sẵn sàng ghép nối phần cứng). Toàn bộ luồng dữ liệu từ thiết bị lên máy chủ được trừu tượng hóa qua giao thức chuẩn MQTT1. Ở giai đoạn hiện tại, một bộ giả lập phần mềm (Device Simulator) sẽ đóng vai trò node cảm biến gửi dữ liệu telemetry và nhận lệnh điều khiển y hệt thiết bị thật; khi có mạch ESP32 trước hạn nộp mã nguồn (24/11/2026) và bảo vệ đồ án (25/11/2026 và 02/12/2026), nhóm chỉ cần nạp firmware kết nối vào đúng MQTT Topic đã dựng mà không phải sửa đổi mã nguồn ở Backend hay Frontend1. (Lưu ý: Hai tệp tài liệu được cung cấp đều là văn bản Đề bài Đồ án Kết thúc Học phần và liên kết trang tính đăng ký nhóm bị giới hạn quyền truy cập1; do đó, bản đặc tả này bám sát khung tiêu chí chấm điểm chính thức của học phần kết hợp với Tiêu chuẩn Quốc gia TCVN và khuyến nghị của Viện Nghiên cứu Lúa Quốc tế IRRI về bảo quản nông sản1).
Để đạt điểm tối đa trong khuôn khổ đồ án môn học 3 tín chỉ (12 tiết thực hành, chiếm 60% điểm tổng kết) mà không bị lan man sang hướng nghiên cứu học thuật nặng nề1, phạm vi (scope) của hệ thống được đóng khung chiến lược: tập trung giải quyết trọn vẹn 6 nhóm yêu cầu bắt buộc (Phân tích bài toán, Thiết bị vật lý & Mô phỏng, Giao thức MQTT, Backend quản lý người dùng & vòng đời thiết bị 10 bước, Bảo mật & Kiểm thử bảo mật, Giao diện Web thời gian thực) và tích hợp chọn lọc 2 tính năng nâng cao thiết thực là Rule Engine đánh giá Độ ẩm cân bằng (EMC) để tự động hóa quạt thông gió và Đóng gói triển khai bằng Docker Compose1. Căn cứ theo Mục 9 của đề bài, nhóm tuyệt đối lưu ý: thiết bị mô phỏng được phép dùng để phát triển sớm và kiểm thử tải, nhưng bắt buộc phải có ít nhất 01 mạch phần cứng vật lý (ESP32) hoạt động thực tế trong buổi bảo vệ cuối kỳ để tránh rơi vào mức điểm liệt ("Fail - Below Expectation")1.
Bạn có thể sử dụng trực tiếp tài liệu này theo hai cách: (1) Làm tài liệu thiết kế chuẩn cho các thành viên trong nhóm (tối đa 4 sinh viên) phân chia công việc và trích xuất sang Báo cáo đồ án 20–30 trang cùng 8–12 trang Slide thuyết trình1; (2) Sao chép toàn bộ hoặc từng phân đoạn vào các công cụ AI lập trình (như Cursor, Claude, ChatGPT, GitHub Copilot) dưới dạng tệp CONTEXT.md để AI hiểu toàn bộ bối cảnh và sinh mã nguồn chuẩn xác.
1. Định hình Bài toán, Cơ sở Nghiệp vụ và Giới hạn Phạm vi (Scope Management)
1.1. Bối cảnh và Lý do bắt buộc phải dùng giải pháp IoT (Trả lời câu hỏi bắt buộc Mục 4.1)
Trong chuỗi cung ứng nông nghiệp, hạt ngũ cốc (thóc, gạo, ngô, đậu đỗ) sau thu hoạch là các vật liệu có tính hút ẩm tự nhiên (hygroscopic materials) và vẫn tiếp tục quá trình hô hấp sinh học6. Hạt ngũ cốc liên tục trao đổi hơi nước với không khí xung quanh kho chứa cho đến khi đạt trạng thái Độ ẩm cân bằng (Equilibrium Moisture Content - EMC)5. Theo tổng hợp từ các quy chuẩn quốc gia như TCVN 14237-1:2024 (ISO 712-1:2024), TCVN 8370:2018 và TCVN 8368:2018, độ ẩm hạt tối đa cho phép để bảo quản thóc tẻ và gạo lật là 14,5%, gạo nếp trắng, gạo đồ, yến mạch và sắn khô là 14,0%, tinh bột sắn là 13,0%, đậu đỗ là 14,0% – 15,0%, và bột mì là 15,5%4. Để tích trữ kéo dài từ 8 đến 12 tháng, tài liệu kỹ thuật của IRRI chỉ rõ độ ẩm hạt phải duy trì ở mức ≤12% – 13% (hoặc ≤9% nếu lưu kho trên 1 năm), và độ ẩm tương đối của không khí (Relative Humidity - RH) trong kho phải giữ ở mức ≤65%5. Nếu RH vượt ngưỡng 65% – 70%, nấm mốc và độc tố vi nấm (mycotoxins) sẽ phát triển mạnh7; đồng thời, theo tài liệu hướng dẫn nông nghiệp, khi nhiệt độ khối hạt bắt đầu vượt mức 15,6°C, côn trùng gây hại có thể trở thành vấn đề nghiêm trọng, còn quá trình hạt ẩm tự bốc nóng và lên men sẽ sinh ra khí CO2 và amoniac (NH3)12.
Một ứng dụng Web hay phần mềm quản lý kho thông thường (chỉ nhập liệu phiếu xuất/nhập kho thủ công) không thể giải quyết bài toán này và bắt buộc phải có hệ thống IoT vì ba lý do cốt lõi1:
Độ trễ phát hiện hư hỏng cục bộ: Việc thủ kho cầm máy đo độ ẩm đi kiểm tra định kỳ bằng tay không thể phát hiện kịp thời các "điểm ẩm cục bộ" (wet spots) và hiện tượng ngưng tụ hơi nước hình thành do sự di cư độ ẩm (moisture migration) khi chênh lệch nhiệt độ giữa trong và ngoài silo10. Khi phát hiện bằng mắt thường hoặc mùi hôi thì ngũ cốc đã hư hỏng10.
Rủi ro phản tác dụng khi vận hành quạt thông gió thủ công: Quạt thông gió (aeration system) cần luân chuyển không khí để duy trì nhiệt độ và độ ẩm đồng đều trong khối hạt10. Tuy nhiên, nếu bật quạt thông gió vào thời điểm độ ẩm tương đối của không khí cao hơn mức cân bằng của hạt, khối hạt khô sẽ hút ngược hơi ẩm từ không khí, gây lãng phí năng lượng sấy trước đó và làm mốc hạt7.
Yêu cầu phản ứng vòng kín (Closed-loop Control): Hệ thống cần thu thập dữ liệu vi khí hậu liên tục 24/7 từ cảm biến đặt trong kho, tự động phân loại mức độ rủi ro (SAFE, WARNING, HIGH RISK) theo thời gian thực để kích hoạt tức thời cơ cấu chấp hành (quạt thông gió, đèn/còi báo động) và gửi cảnh báo từ xa cho người vận hành ngay khi vượt ngưỡng1.

1.2. Chiến lược Giới hạn Phạm vi (Scope Matrix) để Đạt Điểm Tốt
Nhiều nhóm sinh viên bị quá tải vì cố gắng làm quá nhiều tính năng phức tạp nhưng lại bỏ sót các yêu cầu quản lý cốt lõi của đề bài1. Bảng dưới đây phân định rõ những hạng mục cần làm sâu và những hạng mục cần lược bỏ để tối ưu hóa công sức từ nay đến hạn nộp 24/11/2026:

Hạng mục
Phạm vi thực hiện trong Đồ án (In-Scope - Tối ưu điểm số)
Phạm vi lược bỏ (Out-of-Scope - Tránh sa lầy)
Lý do chiến lược theo Đề bài
Phần cứng (Hardware)
01 – 02 Node ESP32 gắn cảm biến nhiệt ẩm SHT31 (hoặc DHT22/AHT20), cảm biến khí MQ-135, màn hình OLED/LCD, Còi Buzzer, 3 đèn LED (Xanh/Vàng/Đỏ) và Relay 5V điều khiển quạt DC 5V/12V1.
Không đấu nối điện lưới 220V AC; không chế tạo hệ thống sấy nhiệt công nghiệp hay cơ cấu đảo hạt cơ khí phức tạp; không dùng mạng diện rộng nhiều trạm.
Đáp ứng khuyến nghị từ 2 loại dữ liệu cảm biến trở lên, ít nhất 1 cơ cấu chấp hành, từ 2 node thiết bị cho nhóm 4 người, và tuân thủ Quy định an toàn điện Mục 101.
Giai đoạn chưa có mạch
Xây dựng Simulator Script (Node.js/Python) kết nối trực tiếp vào MQTT Broker, giả lập gửi dữ liệu của 2–3 node kho và phản hồi lệnh ACK tự động1.
Không viết giao diện Web chỉ đọc dữ liệu giả cố định (hardcoded JSON) trên trình duyệt mà bỏ qua MQTT Broker và Database.
Giúp hoàn thiện 100% luồng dữ liệu đầu cuối (End-to-End) để demo sớm và ghép nối ESP32 thật nhanh chóng khi có mạch1.
Backend & Quản trị
Tự xây dựng Backend (Node.js/Express hoặc NestJS) quản lý 3 vai trò người dùng (RBAC), quản lý vòng đời thiết bị 10 bước, lưu lịch sử lệnh và Audit Log1.
Không dùng các nền tảng dựng sẵn như Blynk, ThingSpeak hay Adafruit IO làm hệ thống chính1.
Mục 4.4 và Mục 9 quy định rõ: chỉ dùng dashboard có sẵn mà không tự xây dựng quản lý người dùng và thiết bị sẽ không đạt yêu cầu1.
Tính năng nâng cao (Bonus)
Chọn Rule Engine (tự động ước tính độ ẩm cân bằng EMC & bật quạt khi vượt ngưỡng) + Docker Compose (đóng gói DB, MQTT, Backend, Frontend)1.
Không làm AI nhận diện hình ảnh phức tạp hay OTA ký số mật mã nếu hệ thống cơ bản chưa hoạt động ổn định1.
Mục 5 nhấn mạnh chức năng nâng cao không thay thế yêu cầu bắt buộc và chỉ nên triển khai sau khi hệ thống cơ bản đã ổn định1.

2. Kiến trúc Tổng thể Hệ thống (Mock-First & Hardware-Ready Architecture)
Hệ thống được thiết kế theo kiến trúc phân lớp 5 tầng chuẩn IoT (Thiết bị, Kết nối, Backend, Dữ liệu và Ứng dụng), đáp ứng đầy đủ yêu cầu thiết kế tại Mục 6 của đề bài1. Điểm mấu chốt của kiến trúc này là Tầng Kết nối (MQTT Broker) đóng vai trò điểm hội tụ: Backend hoàn toàn không phân biệt bản tin đến từ kịch bản giả lập (Simulator) hay từ vi điều khiển ESP32 vật lý, miễn là thiết bị đó cung cấp đúng định danh device_id và thông tin xác thực riêng hợp lệ1.

2.1. Chi tiết Ngăn xếp Công nghệ Đề xuất (Tech Stack)
Ngăn xếp công nghệ dưới đây được lựa chọn dựa trên tiêu chí phổ biến, dễ giải thích lý do kỹ thuật khi bảo vệ đồ án (Mục 6), các công cụ AI hỗ trợ sinh mã tốt và dễ đóng gói bằng Docker1:

Tầng Kiến trúc
Công nghệ Đề xuất
Vai trò & Lý do lựa chọn kỹ thuật
Tầng Thiết bị (Khi có mạch)
ESP32-WROOM-32 DevKit (C/C++ trên PlatformIO hoặc Arduino IDE)
Hỗ trợ sẵn Wi-Fi 2.4GHz, tích hợp thư viện PubSubClient (MQTT), ArduinoJson và Adafruit_SHT3113.
Tầng Giả lập (Hiện tại)
Node.js Simulator Script (mqtt.js) + Web Simulator Drawer
Giả lập đầy đủ hành vi của node ESP32 (gửi telemetry, heartbeat, LWT và phản hồi lệnh điều khiển ACK) phục vụ phát triển sớm và kiểm thử tải1.
Tầng Kết nối & Giao thức
Eclipse Mosquitto MQTT Broker (chạy trên Docker)
Giao thức pub/sub nhẹ, độ trễ thấp, hỗ trợ QoS, Last Will and Testament (LWT) để phát hiện thiết bị offline tức thời và phân quyền ACL theo topic1.
Tầng Backend & Xử lý
Node.js + Express (hoặc NestJS) + TypeScript + Prisma ORM + Socket.IO
Xây dựng REST API cho Frontend, MQTT Worker tiếp nhận dữ liệu, Rule Engine kiểm tra ngưỡng, JWT + Bcrypt cho bảo mật và WebSocket đẩy dữ liệu thời gian thực1.
Tầng Cơ sở Dữ liệu
PostgreSQL
Lưu trữ dữ liệu quan hệ (người dùng, vòng đời thiết bị, lịch sử lệnh, cảnh báo, audit log) kết hợp bảng dữ liệu chuỗi thời gian telemetry_logs đánh chỉ mục theo (device_id, recorded_at DESC)1.
Tầng Giao diện (Frontend)
React.js (Vite hoặc Next.js) + TailwindCSS + Recharts + Lucide Icons
Xây dựng giao diện quản trị phân quyền, biểu đồ lịch sử/thời gian thực, bảng điều khiển thiết bị và trung tâm xử lý cảnh báo1.

3. Thiết kế Giao thức MQTT, Cấu trúc Bản tin và Luồng Dữ liệu (Mục 4.3 & Mục 6)
Để đáp ứng yêu cầu tại Mục 4.3, hệ thống sử dụng MQTT cho giao tiếp giữa thiết bị và Backend, đồng thời dùng HTTP/REST kết hợp WebSocket cho giao tiếp giữa Frontend và Backend1. Thiết kế giao tiếp làm rõ cấu trúc topic, định dạng bản tin, mã định danh thiết bị, nhãn thời gian (timestamp), đơn vị đo, cơ chế xác nhận lệnh điều khiển (cmd → ack), phát hiện online/offline và xử lý bản tin trùng lặp1.
3.1. Quy hoạch Cấu trúc MQTT Topics
Toàn bộ các topic tuân theo quy ước phân cấp grain/devices/{device_id}/{channel} để dễ dàng cấu hình danh sách kiểm soát truy cập (ACL) trên Broker (mỗi thiết bị chỉ được phép publish/subscribe vào đúng {device_id} của mình)1:

MQTT Topic
Chiều truyền
QoS
Retain
Mục đích & Cơ chế xử lý
grain/devices/{device_id}/telemetry
Thiết bị → Backend
QoS 1
false
Gửi dữ liệu cảm biến định kỳ (mặc định mỗi 5–10 giây khi demo). Dùng QoS 1 để đảm bảo bản tin đến ít nhất 1 lần.
grain/devices/{device_id}/status
Thiết bị/Broker → Backend
QoS 1
true
Gửi nhịp tim (Heartbeat) mỗi 30 giây và bản tin LWT (Last Will and Testament). Khi thiết bị mất nguồn hoặc rớt mạng đột ngột, Broker tự động phát bản tin OFFLINE.
grain/devices/{device_id}/cmd
Backend → Thiết bị
QoS 1
false
Backend gửi lệnh điều khiển cơ cấu chấp hành (bật/tắt quạt, còi) hoặc cập nhật cấu hình từ xa (thay đổi ngưỡng nhiệt ẩm, chu kỳ gửi dữ liệu).
grain/devices/{device_id}/ack
Thiết bị → Backend
QoS 1
false
Thiết bị gửi phản hồi xác nhận đã thực thi lệnh điều khiển hoặc áp dụng cấu hình thành công, kèm mã cmd_id tương ứng.

3.2. Đặc tả Định dạng Payload JSON Chuẩn (Dùng chung cho Simulator và ESP32)
Cả kịch bản Simulator lẫn mã nhúng ESP32 đều tuân thủ nghiêm ngặt 4 mẫu JSON dưới đây.
Bản tin 1 – Telemetry (grain/devices/DEV_SILO_01/telemetry):



JSON
{
  "msg_id": "msg_1730001234_981",
  "device_id": "DEV_SILO_01",
  "fw_version": "1.0.2",
  "timestamp": 1730001234000,
  "metrics": {
    "temperature": { "value": 24.6, "unit": "C" },
    "humidity_air": { "value": 62.5, "unit": "%RH" },
    "gas_ppm": { "value": 415.0, "unit": "ppm" },
    "estimated_emc": { "value": 12.6, "unit": "%MC" }
  },
  "actuators": {
    "fan_state": "OFF",
    "buzzer_state": "OFF",
    "control_mode": "AUTO",
    "risk_level": "SAFE"
  },
  "rssi": -64
}


Trường msg_id là khóa định danh bản tin duy nhất giúp Backend loại bỏ bản tin trùng lặp (deduplication) khi MQTT QoS 1 truyền lại gói tin do mạng chập chờn1. Trường estimated_emc biểu thị độ ẩm cân bằng ước tính của hạt ngũ cốc (%MC) tương ứng với nhiệt độ và độ ẩm không khí hiện tại5.
Bản tin 2 – Trạng thái & Heartbeat (grain/devices/DEV_SILO_01/status):



JSON
{
  "device_id": "DEV_SILO_01",
  "state": "ONLINE",
  "ip_address": "192.168.1.105",
  "fw_version": "1.0.2",
  "hw_version": "ESP32-WROOM-32-v1",
  "uptime_sec": 3620,
  "timestamp": 1730001234000
}


Ngay khi khởi tạo kết nối MQTT, thiết bị đăng ký sẵn bản tin Last Will (LWT) trên cùng topic này với nội dung {"device_id": "DEV_SILO_01", "state": "OFFLINE", "reason": "LWT_TIMEOUT"}1. Nếu thiết bị ngắt kết nối bất thường, Broker tự động phát bản tin LWT này để Backend cập nhật trạng thái OFFLINE ngay lập tức1.
Bản tin 3 – Lệnh Điều khiển & Cấu hình từ xa (grain/devices/DEV_SILO_01/cmd):



JSON
{
  "cmd_id": "cmd_88219a",
  "device_id": "DEV_SILO_01",
  "issued_by": "user_operator_01",
  "timestamp": 1730001250000,
  "type": "ACTUATOR_CONTROL",
  "payload": {
    "target": "VENTILATION_FAN",
    "action": "TURN_ON",
    "control_mode": "MANUAL",
    "duration_sec": 600
  }
}


Khi người vận hành thay đổi cấu hình ngưỡng từ xa, trường type sẽ nhận giá trị "UPDATE_CONFIG" và payload chứa {"sampling_interval_ms": 5000, "temp_warn_threshold": 25.0, "temp_crit_threshold": 30.0, "hum_warn_threshold": 65.0, "hum_crit_threshold": 70.0}1.
Bản tin 4 – Phản hồi Xác nhận Lệnh (grain/devices/DEV_SILO_01/ack):



JSON
{
  "cmd_id": "cmd_88219a",
  "device_id": "DEV_SILO_01",
  "status": "SUCCESS",
  "executed_at": 1730001250320,
  "current_actuators": {
    "fan_state": "ON",
    "buzzer_state": "OFF",
    "control_mode": "MANUAL"
  },
  "message": "Relay GPIO 26 switched HIGH"
}


Để xử lý cơ chế Timeout và Retry theo yêu cầu tại Mục 4.3, khi người dùng gửi lệnh trên Web, Backend tạo bản ghi trong bảng device_commands với trạng thái PENDING và khởi động bộ đếm chờ 5 giây1. Nếu sau 5 giây chưa nhận được bản tin ack khớp cmd_id, Backend tự động gửi lại lệnh (tối đa 2 lần retry); nếu vẫn không có phản hồi thì đánh dấu lệnh là TIMEOUT và thông báo lỗi lên giao diện1.
4. Đặc tả Cơ sở Dữ liệu, Backend, Phân quyền và Vòng đời Thiết bị (Mục 4.4 & 4.5)
Đề bài quy định rõ: hệ thống bắt buộc phải tự xây dựng phần quản lý người dùng, quản lý vòng đời thiết bị, quản lý dữ liệu, giám sát cảnh báo và điều khiển thiết bị1.
4.1. Mô hình Dữ liệu Quan hệ (ERD & Database Schema)
Cơ sở dữ liệu PostgreSQL bao gồm 7 bảng cốt lõi. Khi sử dụng AI để sinh mã Prisma Schema hoặc SQL Migration, bạn hãy cung cấp chính xác cấu trúc bảng dưới đây:

Tên bảng (Table)
Các trường thông tin chính (Columns & Types)
Mối quan hệ & Nghiệp vụ đáp ứng Đề bài
users
id (UUID, PK), email (Unique), password_hash (Bcrypt), full_name, role (ADMIN, OPERATOR, VIEWER), status (ACTIVE, LOCKED), telegram_chat_id, created_at
Quản lý tài khoản, trạng thái hoạt động, băm mật khẩu an toàn và phân quyền 3 vai trò (Mục 4.4.a & 4.5).
warehouse_zones
id (UUID, PK), name (VD: "Kho Silo Thóc Tẻ A1"), grain_type (VD: "Thóc tẻ - TCVN 8370"), target_mc (14.0), max_rh (65.0), manager_id (FK → users.id)
Phân vùng khu vực kho để gán thiết bị và giới hạn phạm vi truy cập dữ liệu theo người dùng (Mục 4.4.b & 4.5).
devices
id (UUID, PK), device_code (Unique, VD: DEV_SILO_01), name, secret_token_hash, zone_id (FK → warehouse_zones.id), lifecycle_state (REGISTERED, PROVISIONED, ACTIVE, OFFLINE, FAULT, MAINTENANCE, SUSPENDED, DECOMMISSIONED), is_online (Boolean), fw_version, hw_version, config_json (JSONB), last_seen_at
Quản lý trọn vẹn 10 bước vòng đời thiết bị, định danh riêng, theo dõi phiên bản phần cứng/firmware và khóa kết nối (Mục 4.4.b & 4.5).
telemetry_logs
id (BigInt, PK), device_id (FK → devices.id), msg_id (Unique), temperature (Float), humidity_air (Float), gas_ppm (Float), estimated_emc (Float), fan_state (Boolean), risk_level (SAFE, WARNING, HIGH_RISK), recorded_at (Timestamptz)
Lưu trữ chuỗi thời gian, chống trùng lặp qua msg_id, phục vụ tra cứu lịch sử, thống kê và xuất CSV (Mục 4.4.c).
alerts
id (UUID, PK), device_id (FK), zone_id (FK), alert_type (HIGH_HUMIDITY, HIGH_TEMP, GAS_SPIKE, DEVICE_OFFLINE), severity (WARNING, CRITICAL), message, trigger_value, status (NEW, ACKNOWLEDGED, RESOLVED), ack_by (FK → users.id), ack_note, created_at, resolved_at
Lưu lịch sử cảnh báo và quy trình người dùng xác nhận/xử lý cảnh báo (Mục 4.4.d).
device_commands
id (UUID, PK), cmd_id (Unique), device_id (FK), issued_by (FK → users.id), command_type, payload_json, status (PENDING, SUCCESS, FAILED, TIMEOUT), retry_count, created_at, executed_at
Lưu lịch sử lệnh điều khiển quạt/cấu hình và kết quả phản hồi ACK từ thiết bị (Mục 4.4.e).
audit_logs
id (BigInt, PK), actor_id (FK → users.id), action (VD: REVOKE_DEVICE, UPDATE_THRESHOLD, UNAUTHORIZED_ACCESS_ATTEMPT), target_type, target_id, ip_address, details_json, created_at
Ghi nhật ký kiểm toán (audit log) cho các thao tác quan trọng và sự kiện bảo mật (Mục 4.5).

4.2. Ma trận Vai trò và Phân quyền (RBAC Matrix - Mục 4.4.a & Mục 6)
Hệ thống kiểm tra quyền truy cập trực tiếp ở tầng Middleware của Backend (không chỉ ẩn nút bấm trên giao diện) và đảm bảo người dùng chỉ được truy cập thiết bị thuộc khu vực kho (warehouse_zones) được cấp quyền1:
Nhóm Chức năng / Thao tác Nghiệp vụ
ADMIN (Quản trị viên)
OPERATOR (Thủ kho vận hành)
VIEWER (Người xem / Kiểm định)
Quản lý người dùng (Tạo tài khoản, đổi mật khẩu/vai trò, khóa tài khoản)
Toàn quyền
Không có quyền (403)
Không có quyền (403)
Đăng ký thiết bị mới (Onboarding), cấp Token, Tạm khóa (SUSPENDED) hoặc Ngừng sử dụng (DECOMMISSIONED)
Toàn quyền
Không có quyền (403)
Không có quyền (403)
Kích hoạt thiết bị, chuyển trạng thái Bảo trì (MAINTENANCE), cấu hình tham số ngưỡng từ xa
Toàn quyền
Được phép (trong Kho được gán)
Không có quyền (403)
Gửi lệnh điều khiển từ xa (Bật/Tắt quạt thông gió, còi báo động, đổi chế độ Auto/Manual)
Toàn quyền
Được phép (trong Kho được gán)
Không có quyền (403)
Xác nhận và xử lý cảnh báo (ACKNOWLEDGED / RESOLVED kèm ghi chú)
Toàn quyền
Được phép (trong Kho được gán)
Không có quyền (403)
Xem Dashboard thời gian thực, tra cứu biểu đồ lịch sử, lọc thống kê và xuất CSV
Toàn bộ các kho
Chỉ các Kho được gán
Chỉ các Kho được gán
Xem nhật ký kiểm toán bảo mật (audit_logs)
Toàn quyền
Không có quyền (403)
Không có quyền (403)

4.3. Quy trình Quản lý Vòng đời Thiết bị 10 Bước (Device Lifecycle - Mục 4.4.b)
Hệ thống quản lý đầy đủ 10 bước vòng đời thiết bị từ khi đăng ký đến khi ngừng hoạt động thông qua các trạng thái chuẩn1:
Đăng ký / Onboarding (REGISTERED): ADMIN tạo thiết bị mới trên Web (ví dụ mã DEV_SILO_01).
Cấp mã định danh và thông tin xác thực: Hệ thống sinh mã bí mật riêng (device_secret) chỉ hiển thị một lần khi tạo và lưu bản băm (secret_token_hash) vào cơ sở dữ liệu (tuyệt đối không dùng chung một khóa bí mật cho mọi thiết bị)1.
Gán thiết bị cho khu vực và người dùng (PROVISIONED): ADMIN gán thiết bị vào "Kho Silo Thóc Tẻ A1" do một OPERATOR quản lý và khởi tạo cấu hình mặc định (max_rh: 65%, sampling_interval: 5s)1.
Kích hoạt thiết bị (ACTIVE): Khi thiết bị (hoặc Simulator) kết nối thành công bằng thông tin xác thực hợp lệ và gửi bản tin trạng thái/telemetry đầu tiên, hệ thống chuyển trạng thái sang ACTIVE và đặt is_online = true1.
Cấu hình tham số hoạt động từ xa: OPERATOR cập nhật ngưỡng nhiệt ẩm hoặc chu kỳ đọc cảm biến trên giao diện Web; Backend gửi bản tin xuống topic /cmd và chờ /ack1.
Theo dõi trạng thái Online/Offline (OFFLINE): Khi nhận bản tin LWT từ Broker hoặc quá 45 giây không có Heartbeat, thiết bị chuyển sang trạng thái OFFLINE và phát cảnh báo mất kết nối1.
Theo dõi phiên bản phần cứng và firmware: Mỗi bản tin trạng thái cập nhật trường hw_version và fw_version hiển thị trên trang thông tin thiết bị1.
Ghi nhận lỗi hoặc trạng thái bảo trì (FAULT / MAINTENANCE): Nếu cảm biến SHT31 lỗi giao tiếp I2C, thiết bị báo trạng thái FAULT1. Khi thủ kho vệ sinh cảm biến hoặc hun trùng kho, OPERATOR chuyển thiết bị sang MAINTENANCE để tạm dừng sinh cảnh báo giả1.
Tạm khóa hoặc thu hồi quyền kết nối (SUSPENDED): Khi nghi ngờ lộ khóa bí mật hoặc thiết bị gửi dữ liệu bất thường, ADMIN khóa thiết bị; MQTT Worker và API lập tức từ chối mọi gói tin từ thiết bị này và ghi nhận vào audit_logs1.
Ngừng sử dụng (DECOMMISSIONED): Khi thanh lý thiết bị hỏng, ADMIN chuyển sang DECOMMISSIONED, vô hiệu hóa vĩnh viễn quyền kết nối nhưng bảo toàn dữ liệu lịch sử để phục vụ tra cứu1.
4.4. Logic Rule Engine Bảo quản Ngũ cốc (Tính năng Nâng cao Thực chiến)
Để tạo điểm nhấn chuyên môn cho đề tài kho ngũ cốc, Backend tích hợp một Rule Engine đánh giá đồng thời Nhiệt độ, Độ ẩm tương đối (RH), Độ ẩm cân bằng ước tính của hạt (EMC) và nồng độ khí1:
Theo dữ liệu thực nghiệm về bảo quản lúa gạo của IRRI và tài liệu khuyến nông đại học, ở 80°F (~26,7°C) và 63% RH, độ ẩm cân bằng (EMC) của lúa đạt khoảng 12,5% (an toàn để bảo quản lâu dài); nhưng khi độ ẩm không khí tăng lên 75% RH ở 75°F (~23,9°C), EMC của lúa tăng lên 15,2% (vượt ngưỡng an toàn 14% – 14,5%, khiến hạt hút ẩm và mốc)4. Trong mã nguồn Backend và Simulator của đồ án, nhóm có thể cài đặt bảng tra cứu nội suy (lookup table) hoặc hàm nội suy tuyến tính phục vụ nguyên mẫu để ước tính chỉ số estimated_emc từ nhiệt độ và RH, kết hợp bộ quy tắc phân loại 3 mức rủi ro5:

Mức độ Rủi ro
Điều kiện Kích hoạt (Thresholds)
Hành động Tự động của Hệ thống (Rule Engine)
SAFE (An toàn)
RH ≤ 65% VÀ Nhiệt độ ≤ 25°C VÀ EMC ước tính ≤ 14.0% VÀ Gas < 600 ppm
Đèn LED Xanh sáng trên mạch; Quạt thông gió ở trạng thái OFF (nếu đang ở chế độ AUTO) để tiết kiệm năng lượng.
WARNING (Cảnh báo)
65% < RH ≤ 70% HOẶC 15.6°C < Nhiệt độ ≤ 28°C (nguy cơ côn trùng hoạt động12) HOẶC 14.0% < EMC ≤ 14.8%
Đèn LED Vàng sáng; sinh bản ghi cảnh báo mức WARNING trên Dashboard; nếu thiết bị ở chế độ AUTO, Backend tự động gửi lệnh Bật quạt thông gió (TURN_ON_FAN) để luân chuyển không khí.
HIGH_RISK (Nguy hiểm cao)
RH > 70% (nguy cơ nấm mốc cao10) HOẶC Nhiệt độ > 28°C HOẶC EMC > 14.8% HOẶC Gas ≥ 700 ppm (hạt lên men sinh khí CO2/NH313)
Đèn LED Đỏ sáng + Còi Buzzer kêu tại kho + Bật quạt thông gió tối đa; sinh cảnh báo mức CRITICAL trên Web và gửi thông báo tức thời qua Telegram Bot cho Thủ kho.

5. Thiết kế Giao diện Web và Cơ chế Giả lập khi Chưa có Thiết bị (Mục 4.6)
5.1. Bố cục 6 Khu vực Chức năng trên Giao diện Web
Giao diện Web cần thiết kế trực quan, thể hiện rõ các quy trình nghiệp vụ và chức năng quản lý bắt buộc tại Mục 4.61:

Màn hình / Route
Các Thành phần Giao diện & Chức năng Nghiệp vụ
1. Đăng nhập (/login)
Form đăng nhập bằng Email/Mật khẩu. Tích hợp thêm 3 nút "Điền nhanh tài khoản Demo" (Admin, Operator, Viewer) để chuyển đổi vai trò nhanh chóng trong buổi bảo vệ đồ án.
2. Dashboard Tổng quan (/dashboard)
Hiển thị 4 thẻ KPI toàn hệ thống (Tổng thiết bị Online/Offline, Số cảnh báo mới, Độ ẩm RH & EMC trung bình, Trạng thái quạt). Bên dưới là lưới thẻ từng thiết bị theo khu vực kho, hiển thị trạng thái ONLINE/OFFLINE, chỉ số Nhiệt độ (°C), Độ ẩm (%RH), EMC (%MC), Khí gas (ppm), nhãn rủi ro (SAFE/WARNING/HIGH RISK) và công tắc điều khiển nhanh Quạt thông gió (hiển thị hiệu ứng chờ Pending ACK... → Active).
3. Chi tiết Thiết bị & Lịch sử (/devices/:id)
Biểu đồ đường thời gian thực (Real-time Line Chart) cập nhật qua WebSocket; bộ lọc tra cứu dữ liệu lịch sử theo khoảng thời gian kèm thống kê Min / Max / Avg và nút Xuất báo cáo CSV; biểu mẫu Cấu hình từ xa (Remote Config) và bảng Lịch sử lệnh điều khiển (device_commands).
4. Quản lý Vòng đời Thiết bị (/devices)
Danh sách thiết bị kèm trạng thái vòng đời (REGISTERED, PROVISIONED, ACTIVE, OFFLINE, MAINTENANCE, SUSPENDED, DECOMMISSIONED). Cung cấp hộp thoại tạo thiết bị mới (Onboarding & cấp Secret Token), gán khu vực kho, chuyển sang bảo trì, khóa thu hồi quyền kết nối hoặc ngừng sử dụng.
5. Trung tâm Cảnh báo (/alerts)
Bảng danh sách lịch sử cảnh báo vượt ngưỡng hoặc thiết bị rớt mạng. Cho phép OPERATOR và ADMIN bấm nút Xác nhận (Acknowledge) và nhập ghi chú biện pháp khắc phục để chuyển trạng thái sang Đã xử lý (Resolved).
6. Quản trị & Audit Log (/admin)
Khu vực dành riêng cho ADMIN để thêm/sửa/khóa tài khoản người dùng, phân quyền khu vực kho và tra cứu bảng nhật ký bảo mật audit_logs.

5.2. Thiết kế "Simulator Control Drawer" phục vụ Demo khi Chưa có Phần cứng
Để giải quyết nhu cầu có ngay bản Web theo dõi và kiểm thử khi chưa mua mạch ESP32, nhóm nên xây dựng một script giả lập (tests/simulator.ts) kết nối trực tiếp vào MQTT Broker, đồng thời tích hợp một thanh công cụ bật/tắt nhanh trên góc màn hình Web mang tên "Chế độ Giả lập Phần cứng (Hardware Simulator Drawer)". Thanh công cụ này cho phép kích hoạt 5 kịch bản kiểm thử chỉ bằng 1 cú nhấp chuột:
Kịch bản 1 – Kho An toàn (Normal Safe Mode): Phát định kỳ mỗi 3 giây các bản tin MQTT với nhiệt độ dao động 22,0°C – 24,0°C, độ ẩm không khí 58% – 62% RH, khí gas 400 ppm, mức rủi ro SAFE.
Kịch bản 2 – Nồm ẩm đột ngột (Humidity Spike > 72% RH): Tăng dần độ ẩm không khí lên 74% RH để trình diễn Rule Engine tự động phát hiện nguy cơ nấm mốc, đẩy mức rủi ro lên HIGH_RISK, sinh cảnh báo đỏ, tự động bắn lệnh MQTT bật quạt thông gió và thiết bị giả lập trả về bản tin ACK sau 300 ms1.
Kịch bản 3 – Hạt lên men sinh nhiệt & khí (Fermentation Spike): Đẩy nhiệt độ lên 31°C và nồng độ khí MQ-135 lên 850 ppm để kích hoạt cảnh báo lên men hạt và bật còi báo động13.
Kịch bản 4 – Đứt kết nối đột ngột (Simulate Power/Wi-Fi Loss): Ngắt socket MQTT của bộ giả lập không báo trước để Broker tự động phát bản tin LWT, chứng minh giao diện Web chuyển trạng thái thiết bị sang OFFLINE trong vòng vài giây1.
Kịch bản 5 – Kiểm thử tấn công bảo mật (Revoked Device Attack): Dùng thông tin của một thiết bị đã bị khóa (SUSPENDED) cố tình bắn bản tin telemetry vào Broker để chứng minh hệ thống từ chối lưu dữ liệu và ghi vết vào audit_logs1.
6. Thiết kế Phần cứng và Sơ đồ Đấu nối Chuẩn bị cho Giai đoạn Ghép Mạch (Mục 4.2, Mục 6 & Mục 10)
Khi nhóm mua linh kiện để lắp ráp nguyên mẫu vật lý trước hạn nộp 24/11/20261, cấu hình phần cứng dưới đây đảm bảo chi phí thấp (trong tài liệu tham khảo quốc tế, một bộ nguyên mẫu ESP32 kèm cảm biến nhiệt ẩm, màn hình hiển thị, đèn LED, còi buzzer và dây cắm có tổng chi phí chỉ khoảng 1.390 – 1.590 BDT15), dễ lắp trên breadboard và tương thích 100% với cấu trúc bản tin MQTT đã lập trình.
6.1. Kiến trúc Khối Phần cứng, Sơ đồ Đấu nối Chân GPIO và Giải thích Kỹ thuật
Kiến trúc phần cứng của một Node giám sát kho ngũ cốc được tổ chức thành 3 khối rõ rệt: Khối Thu thập dữ liệu (Input Sensors) gồm cảm biến nhiệt ẩm kỹ thuật số SHT31 và cảm biến chất lượng không khí MQ-135; Khối Xử lý & Truyền thông trung tâm (MCU Core) sử dụng vi điều khiển ESP32-WROOM-32 DevKit cấp nguồn 5V qua cổng Micro-USB/Type-C; và Khối Hiển thị tại chỗ & Cơ cấu chấp hành (Local Display & Output Actuators) gồm màn hình OLED I2C, cụm 3 đèn LED báo trạng thái (Xanh/Vàng/Đỏ), còi báo động Buzzer và module Relay 5V cách ly quang (opto-isolated) điều khiển quạt thông gió không chổi than DC 5V/12V1.
Cảm biến SHT31 (địa chỉ I2C mặc định 0x44, hoặc 0x45 nếu kéo chân ADDR lên mức cao) và màn hình OLED 0.96 inch (địa chỉ I2C 0x3C) được mắc song song trên cùng một đường bus I2C nối vào chân GPIO 21 (SDA) và GPIO 22 (SCL) của ESP32, giúp tiết kiệm tối đa chân tín hiệu18. Bảng dưới đây cung cấp sơ đồ đấu nối từng chân linh kiện kèm lập luận kỹ thuật để nhóm đưa trực tiếp vào Mục 6 và Chương 8 của Báo cáo đồ án1:

Linh kiện Phần cứng
Sơ đồ Đấu nối Chân với ESP32-WROOM-32
Giải thích Lựa chọn Kỹ thuật cho Bài toán Kho Ngũ cốc
Vi điều khiển ESP32-WROOM-32 DevKit
Cấp nguồn 5V qua cổng USB; chân 3V3 và VIN (5V) cấp nguồn cho ngoại vi; chân GND nối chung toàn mạch.
Tích hợp sẵn Wi-Fi 2.4GHz ổn định, bộ nhớ đủ lớn để chạy đồng thời ngăn xếp mạng TCP/MQTT, lưu cấu hình vào Flash và xử lý logic phân loại rủi ro tại biên mà không cần đa bo mạch phức tạp13.
Cảm biến Nhiệt độ & Độ ẩm SHT31 (hoặc AHT20 địa chỉ 0x38 / DHT22)
VIN → 3V3 (hỗ trợ dải 2,4V – 5,5V); GND → GND; SDA → GPIO 21; SCL → GPIO 22 (Địa chỉ I2C: 0x44).
SHT31 có độ chính xác cao với sai số độ ẩm ±2% RH (dải 0–100% RH) và nhiệt độ ±0,3°C (dải -40 đến +125°C), vượt trội hơn DHT22 (±0,5°C và bị trễ lấy mẫu tối thiểu 2 giây). Đặc biệt, SHT31 tích hợp sẵn điện trở sấy (built-in heater) có thể kích hoạt ngắn hạn để làm bay hơi sương ngưng tụ trên bề mặt cảm biến trong kho ẩm18.
Cảm biến Khí MQ-135
VCC → 5V (VIN); GND → GND; A0 (Analog Out) → GPIO 34 (ADC1_CH6).
Phát hiện sự gia tăng khí CO2 và NH3 sinh ra khi hạt ngũ cốc bị ẩm và lên men vi sinh13. Chọn chân GPIO 34 thuộc bộ chuyển đổi tương tự-số ADC1 vì bộ ADC2 của ESP32 không thể đọc chính xác khi đang bật Wi-Fi.
Màn hình OLED 0.96" I2C (hoặc LCD 128x32)
VCC → 3V3; GND → GND; SDA → GPIO 21; SCL → GPIO 22 (Địa chỉ I2C: 0x3C).
Hiển thị trực tiếp tại cửa kho các thông số nhiệt độ, độ ẩm, trạng thái kết nối Wi-Fi/MQTT và cảnh báo SAFE / WARNING / HIGH RISK cho công nhân kho quan sát15.
Module Relay 1 Kênh 5V + Quạt thông gió DC 5V/12V
VCC → 5V; GND → GND; IN → GPIO 26. Tiếp điểm COM và NO của Relay đóng/ngắt nguồn DC 5V/12V cấp cho quạt.
Thực hiện cơ cấu chấp hành thông gió thực tế. Việc sử dụng quạt DC điện áp thấp (5V/12V) qua mạch Relay cách ly quang giúp tuân thủ nghiêm ngặt Quy định an toàn điện Mục 10 (tuyệt đối không tự ý đấu nối trực tiếp điện lưới 220V nếu không có thiết bị cách ly bảo vệ chuẩn)1.
Còi Buzzer chủ động & Cụm 3 đèn LED
Còi Buzzer (+) → GPIO 25; LED Xanh → GPIO 14; LED Vàng → GPIO 27; LED Đỏ → GPIO 12 (mỗi LED nối tiếp điện trở hạn dòng 220 Ω về GND).
Phản hồi trực quan 3 mức độ rủi ro bằng màu sắc (Xanh: An toàn, Vàng: Cảnh báo, Đỏ + Còi Buzzer: Nguy hiểm cao) theo đúng mô hình phân loại rủi ro kho ngũ cốc15.

6.2. Logic Xử lý Mất mạng và Vận hành Tự chủ trên Firmware ESP32 (Mục 4.2)
Để đáp ứng trọn vẹn yêu cầu của Mục 4.2 (phát hiện và xử lý cơ bản khi mất kết nối, tự động kết nối lại khi mạng khôi phục)1, mã nguồn trong thư mục firmware/ cần tuân thủ 4 nguyên tắc:
Vòng lặp không chặn (Non-blocking Loop): Sử dụng bộ đếm thời gian millis() thay vì hàm delay() dài để ESP32 vừa đọc cảm biến, vừa cập nhật màn hình OLED, vừa duy trì kết nối MQTT (client.loop()).
Tự chủ điều khiển tại biên khi đứt mạng (Local Fallback Control): Các ngưỡng nhiệt độ và độ ẩm nhận từ Backend được lưu vào bộ nhớ không khả biến (Preferences trên Flash của ESP32). Khi mất kết nối Wi-Fi hoặc MQTT Broker, ESP32 vẫn tiếp tục đọc cảm biến SHT31 và MQ-135; nếu độ ẩm vượt ngưỡng nguy hiểm, vi điều khiển tự động kích hoạt Relay bật quạt thông gió và bật còi Buzzer tại chỗ để bảo vệ kho hạt1.
Tự động kết nối lại (Auto-Reconnect): Cứ mỗi 5 giây khi phát hiện mất mạng, firmware tự động thử kết nối lại Wi-Fi và MQTT Broker mà không làm treo vòng lặp đọc cảm biến. Khi kết nối thành công trở lại, thiết bị lập tức gửi bản tin ONLINE lên topic /status và đồng bộ trạng thái quạt hiện tại1.
Quy trình Khử sương đọng SHT31 (Anti-Condensation Routine): Khi độ ẩm đọc được bị kẹt ở mức gần 100% RH do ngưng tụ hơi nước, firmware có thể nhận lệnh kích hoạt bộ sấy nội (built-in heater) của SHT31 bằng hàm sht31.heater(true) trong khoảng 5–10 giây để làm bay hơi sương đọng, sau đó tắt bộ sấy (sht31.heater(false)) và chờ vài giây cho cảm biến nguội về nhiệt độ môi trường trước khi đọc lại dữ liệu18.
7. Kế hoạch Kiểm thử, Bảo mật và Kịch bản Demo 10 Bước (Mục 4.5, 7 & 8.4)
7.1. Bốn Kịch bản Kiểm thử Bảo mật Bắt buộc (Mục 4.5)
Đề bài yêu cầu nhóm áp dụng các nguyên tắc bảo mật cơ bản và thực hiện ít nhất 02 kiểm thử bảo mật có bằng chứng minh họa1. Nhóm nên thực hiện đủ 4 bài kiểm thử dưới đây và chụp màn hình kết quả đưa vào Chương 13 & 15 của báo cáo:

Mã Test
Tên Kịch bản Kiểm thử Bảo mật
Cách thực hiện (Steps to Reproduce)
Kết quả kỳ vọng & Bằng chứng nộp báo cáo
SEC-01
Kiểm thử phân quyền RBAC & cô lập phạm vi kho
Đăng nhập bằng tài khoản VIEWER (hoặc OPERATOR của Kho B), dùng Postman gửi yêu cầu POST /api/devices/DEV_SILO_01/commands để bật quạt của Kho A.
Backend chặn ở tầng Middleware, trả về mã lỗi 403 Forbidden, lệnh không được phát lên MQTT và hành vi bị ghi vào bảng audit_logs.
SEC-02
Kiểm thử thiết bị đã bị thu hồi không thể gửi dữ liệu
ADMIN bấm nút khóa (SUSPENDED) thiết bị DEV_SILO_01 trên Web. Sau đó dùng Simulator/ESP32 tiếp tục gửi dữ liệu telemetry bằng thông tin xác thực của thiết bị này.
Hệ thống từ chối lưu dữ liệu (hoặc Broker ngắt kết nối), ghi nhận sự kiện REVOKED_DEVICE_PUBLISH_ATTEMPT vào audit_logs.
SEC-03
Kiểm thử API từ chối Token không hợp lệ hoặc hết hạn
Sửa đổi chữ ký trong chuỗi JWT Bearer Token hoặc dùng Token đã hết hạn gọi vào API lấy dữ liệu lịch sử GET /api/telemetry/DEV_SILO_01.
Backend trả về mã lỗi 401 Unauthorized ngay lập tức.
SEC-04
Kiểm thử từ chối dữ liệu cảm biến không hợp lệ
Gửi bản tin telemetry hoặc gọi API cấu hình chứa giá trị nằm ngoài giới hạn vật lý của cảm biến SHT31: {"temperature": 500, "humidity_air": -20}.
Bộ kiểm tra đầu vào (Input Validator) từ chối gói tin nằm ngoài dải đo (-40 đến +125°C và 0–100% RH), không lưu dữ liệu rác vào cơ sở dữ liệu.

Lưu ý về Quyền riêng tư (Mục 4.5 & Mục 10): Trong báo cáo, nhóm cần nêu rõ hệ thống chỉ thu thập họ tên, email công vụ và Telegram Chat ID của nhân sự vận hành kho để phục vụ phân quyền và gửi cảnh báo kỹ thuật; không thu thập camera, âm thanh hay dữ liệu nhạy cảm cá nhân; mật khẩu được băm bằng Bcrypt và mọi khóa bí mật được truyền qua biến môi trường (.env) không đưa lên GitHub1.
7.2. Phương pháp Đo lường Kiểm thử Phi chức năng (Mục 7.2)
Mục 7.2 yêu cầu mỗi chỉ tiêu phi chức năng phải có phương pháp đo, dữ liệu đo và nhận xét1. Nhóm hãy thiết lập script đo tự động trong thư mục tests/ cho 4 chỉ tiêu sau:

Chỉ tiêu Phi chức năng
Phương pháp Đo lường Thực nghiệm
Dữ liệu Cần thu thập & Cách Nhận xét trong Báo cáo
1. Độ trễ từ cảm biến đến Dashboard
Đồng bộ thời gian máy chạy Simulator/ESP32 và trình duyệt; ghi nhận hiệu số giữa nhãn thời gian hiển thị trên UI (T_render) và thời gian phát bản tin (T_publish) qua 100 mẫu liên tiếp.
Lập bảng giá trị Min, Max, Trung bình (ms) và vẽ biểu đồ phân bố. Nhận xét tốc độ truyền thời gian thực của chuỗi MQTT → Backend → WebSocket.
2. Độ trễ của lệnh điều khiển vòng kín
Truy vấn bảng device_commands, tính hiệu số executed_at - created_at (từ lúc bấm nút bật quạt trên Web đến khi nhận bản tin ACK từ thiết bị) qua 30 lần bấm lệnh.
Báo cáo độ trễ trung bình (ms) và tỷ lệ thành công ở lần gửi đầu tiên (không cần retry).
3. Tỷ lệ mất bản tin & Xử lý bản tin trùng lặp
Chạy Simulator gửi 1.000 bản tin với tần suất cao (trong đó cố tình chèn 50 bản tin có msg_id trùng lặp). Đếm số bản ghi thực tế được lưu trong bảng telemetry_logs.
Chứng minh hệ thống nhận đủ 950 bản tin duy nhất (tỷ lệ mất bản tin 0%) và từ chối chính xác 50 bản tin trùng lặp nhờ ràng buộc UNIQUE(msg_id).
4. Khả năng hoạt động sau khi mất và khôi phục mạng
Ngắt kết nối Wi-Fi/Broker của thiết bị trong 60 giây, sau đó bật lại mạng và đo thời gian từ lúc mạng có lại đến khi Dashboard chuyển trạng thái từ OFFLINE sang ONLINE.
Ghi nhận thời gian phát hiện mất mạng (qua LWT) và thời gian tự động kết nối lại (Auto-reconnect time) của thiết bị.

7.3. Kịch bản Demo Trực tiếp 10 Bước trong 5–7 Phút (Mục 8.4)
Trong buổi bảo vệ cuối kỳ (25/11/2026 hoặc 02/12/2026), mỗi nhóm có 10 phút thuyết trình, 5–7 phút demo trực tiếp và 5 phút vấn đáp (nhóm nên quay sẵn 1 video demo dự phòng nhưng vẫn phải demo trực tiếp)1. Dưới đây là kịch bản 10 bước khớp hoàn toàn với yêu cầu tại Mục 8.4:
Đăng nhập bằng các vai trò khác nhau: Mở song song 2 cửa sổ trình duyệt đăng nhập tài khoản ADMIN/OPERATOR và VIEWER để đối chiếu giao diện theo quyền1.
Đăng ký và kích hoạt thiết bị: Trên cửa sổ ADMIN, tạo mới thiết bị hoặc kích hoạt thiết bị từ trạng thái PROVISIONED sang ACTIVE1.
Thiết bị gửi dữ liệu cảm biến: Cấp nguồn cho mạch ESP32 vật lý (hoặc chạy Simulator khi demo giữa kỳ) để thiết bị gửi nhiệt độ, độ ẩm, khí gas lên MQTT Broker1.
Dashboard hiển thị dữ liệu thời gian thực: Chỉ cho giảng viên thấy các thẻ số liệu và biểu đồ trên cả 2 cửa sổ trình duyệt tự động cập nhật mượt mà qua WebSocket1.
Gửi lệnh điều khiển và nhận phản hồi: Trên cửa sổ OPERATOR, bấm công tắc Bật quạt thông gió; chứng minh Relay trên mạch đóng tiếp điểm, quạt quay và trạng thái lệnh trên Web chuyển từ PENDING sang SUCCESS (ACK)1.
Thay đổi cấu hình thiết bị từ xa: Sửa chu kỳ gửi dữ liệu từ 5 giây xuống 2 giây (hoặc hạ ngưỡng cảnh báo độ ẩm xuống 55% RH) trên Web và gửi xuống thiết bị1.
Ngắt kết nối để phát hiện Offline: Rút cáp nguồn ESP32 (hoặc bấm nút ngắt kết nối trên Simulator); chứng minh Dashboard lập tức chuyển sang trạng thái OFFLINE màu đỏ nhờ cơ chế MQTT LWT1.
Kích hoạt và xử lý một cảnh báo: Cắm lại thiết bị, tạo độ ẩm cao vào cảm biến SHT31 (hoặc bật kịch bản Humidity Spike) → Đèn Đỏ sáng, Còi kêu, Quạt tự bật, Web hiện cảnh báo đỏ và Telegram nhận tin nhắn → Người vận hành bấm Acknowledge và Resolve trên Web1.
Thử một thao tác không được cấp quyền: Dùng tài khoản VIEWER gọi lệnh điều khiển tắt quạt hoặc sửa cấu hình → Hệ thống chặn đứng với thông báo lỗi 403 Forbidden1.
Khóa hoặc Decommission thiết bị: Trên cửa sổ ADMIN, bấm nút Khóa (SUSPENDED) / Ngừng sử dụng (DECOMMISSIONED) thiết bị và chứng minh các bản tin tiếp theo từ thiết bị gửi lên bị từ chối hoàn toàn1.
8. Cấu trúc Thư mục GitHub Chuẩn, Sơ đồ Bắt buộc và Phân công Nhóm (Mục 2, 6 & 8.1)
8.1. Cấu trúc Repository GitHub Bắt buộc (Mục 8.1)
Kho mã nguồn nộp vào ngày 24/11/2026 bắt buộc phải có đúng cấu trúc thư mục dưới đây, có lịch sử commit rõ ràng từ tài khoản GitHub cá nhân của từng thành viên và gắn thẻ phát hành (tag/release) v1.0.01:

Thư mục / Tệp tin
Nội dung bắt buộc phải lưu trữ
Phân công Nhóm 4 Sinh viên (Gợi ý)
README.md
Giới thiệu bài toán bảo quản kho ngũ cốc, kiến trúc hệ thống, hướng dẫn cài đặt và lệnh khởi chạy bằng Docker Compose.
Cả nhóm (Nhóm trưởng tổng hợp)
.env.example
Danh sách biến môi trường mẫu (DATABASE_URL, JWT_SECRET, MQTT_BROKER_URL, TELEGRAM_BOT_TOKEN). Tuyệt đối không chứa mật khẩu hay khóa bí mật thật.
Thành viên 1 (Backend & Database)
database/
Chứa schema.prisma (hoặc file SQL), các bản migration và script seed khởi tạo dữ liệu mẫu (3 vai trò người dùng, khu vực kho, thiết bị mẫu).
Thành viên 1 (Backend & Database)
backend/
Mã nguồn REST API, xác thực/phân quyền RBAC, quản lý vòng đời thiết bị, MQTT Worker tiếp nhận telemetry, Rule Engine EMC, xử lý lệnh ACK và audit_logs.
Thành viên 1 & Thành viên 2
frontend/
Mã nguồn giao diện Web (Đăng nhập, Dashboard thời gian thực, Biểu đồ Recharts, Quản lý thiết bị, Xử lý cảnh báo, Simulator Control Drawer).
Thành viên 3 (Frontend & UI/UX)
firmware/
Mã nguồn C/C++ cho mạch ESP32 đọc cảm biến SHT31 & MQ-135, điều khiển Relay quạt, OLED, LED, Buzzer, xử lý LWT và tự kết nối lại.
Thành viên 4 (Hardware & Embedded)
hardware/
Sơ đồ khối phần cứng, sơ đồ nối dây chi tiết, danh sách linh kiện (BOM) và hình ảnh chụp nguyên mẫu mạch hoạt động thực tế.
Thành viên 4 (Hardware & Embedded)
deployment/
Tệp docker-compose.yml, cấu hình mosquitto.conf và hướng dẫn triển khai hệ thống.
Thành viên 2 (Protocol, DevOps & Testing)
tests/
Mã nguồn bộ giả lập device_simulator, kịch bản kiểm thử chức năng, đo độ trễ phi chức năng và 4 kịch bản kiểm thử bảo mật.
Thành viên 2 & Thành viên 4
docs/
Lưu bản đặc tả CONTEXT.md này, Báo cáo đồ án (20–30 trang), Slide thuyết trình (8–12 slides) và 14 mô hình thiết kế bắt buộc.
Cả nhóm cùng thực hiện

8.2. Danh mục Kiểm tra 14 Mô hình Phân tích & Thiết kế Bắt buộc (Mục 6)
Để đảm bảo không bị mất điểm phần thiết kế trong Báo cáo đồ án (20–30 trang), nhóm cần vẽ đầy đủ 14 mô hình/bảng biểu được yêu cầu tại Mục 6 (có thể dùng công cụ Mermaid.js, Draw.io hoặc PlantUML nhờ AI sinh mã)1:
Sơ đồ bối cảnh hệ thống (System Context Diagram): Thể hiện ranh giới hệ thống IoT kho ngũ cốc tương tác với Thủ kho, Quản trị viên, Kiểm định viên, Môi trường kho hạt và dịch vụ thông báo Telegram1.
Sơ đồ Use Case (hoặc mô tả đầy đủ các trường hợp sử dụng): Phân tách theo 3 tác nhân ADMIN, OPERATOR, VIEWER và tác nhân hệ thống Device/Broker1.
Sơ đồ kiến trúc tổng thể: Thể hiện luồng kết nối đầu cuối từ Node ESP32 / Simulator qua MQTT Broker đến Backend, Database và Web UI1.
Sơ đồ các lớp (Layered Architecture): Làm rõ 5 lớp: Thiết bị, Kết nối, Edge/Gateway, Backend, Dữ liệu và Ứng dụng1.
Sơ đồ khối phần cứng (Hardware Block Diagram): Khối Nguồn 5V/3.3V, Khối Cảm biến (SHT31, MQ-135), Khối Vi điều khiển (ESP32), Khối Chấp hành & Hiển thị (Relay quạt DC, OLED, LED, Buzzer)1.
Sơ đồ kết nối cảm biến và cơ cấu chấp hành (Wiring Schematic): Chi tiết từng chân GPIO như đã đặc tả tại Mục 6.11.
Sơ đồ triển khai (Deployment Diagram): Các container trong Docker Compose (postgres-db, mosquitto-broker, iot-backend, iot-frontend) giao tiếp với mạch ESP32 qua mạng LAN/Wi-Fi1.
Mô hình dữ liệu (ERD): Sơ đồ quan hệ của 7 bảng dữ liệu tại Mục 4.11.
Mô tả API (REST API Specification): Danh sách các endpoint (/api/auth/*, /api/devices/*, /api/telemetry/*, /api/alerts/*, /api/users/*) kèm phương thức, quyền truy cập và mã phản hồi1.
Cấu trúc Topic và Payload MQTT: Bảng quy hoạch 4 topic và 4 mẫu JSON tại Mục 31.
Sequence Diagram cho ít nhất 02 quy trình quan trọng: Vẽ 2 sơ đồ tuần tự cho: (a) Quy trình nhận Telemetry vượt ngưỡng → Rule Engine kích hoạt cảnh báo & tự động bật quạt; và (b) Quy trình Người vận hành gửi lệnh điều khiển từ Web → MQTT /cmd → Thiết bị thực thi → trả về /ack1.
Mô hình trạng thái vòng đời thiết bị (Device Lifecycle State Machine): Sơ đồ chuyển tiếp giữa REGISTERED → PROVISIONED → ACTIVE ↔ OFFLINE/FAULT ↔ MAINTENANCE → SUSPENDED / DECOMMISSIONED1.
Ma trận vai trò và quyền (RBAC Matrix): Bảng phân quyền chi tiết tại Mục 4.21.
Mô hình các mối đe dọa chính và biện pháp kiểm soát (Threat Model): Bảng ánh xạ các nguy cơ (nghe lén mật khẩu, truy cập trái phép thiết bị kho khác, thiết bị giả mạo gửi dữ liệu sau khi bị thu hồi, bơm dữ liệu bẩn) với các biện pháp kiểm soát tương ứng tại Mục 7.11.