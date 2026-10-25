/**
 * Equilibrium Moisture Content (EMC) Calculation Service
 * Dựa trên mô hình Modified Halsey / Henderson cho thóc tẻ theo TCVN 8370
 */
export class EMCService {
  // Modified Halsey parameters for rough rice (Thóc tẻ)
  private static readonly CONST_A = 0.000105;
  private static readonly CONST_B = 2.0;
  private static readonly CONST_C = 35.0;

  /**
   * Tính toán độ ẩm cân bằng ước tính của hạt thóc (%MC)
   * @param tempC Nhiệt độ (°C)
   * @param rhPercent Độ ẩm không khí (%RH)
   * @returns EMC (%MC) làm tròn 1 chữ số thập phân
   */
  static calculate(tempC: number, rhPercent: number): number {
    // Giới hạn RH an toàn tránh lỗi logarit (0.01 đến 0.99)
    const rhClamped = Math.max(1.0, Math.min(99.0, rhPercent));
    const rhDecimal = rhClamped / 100.0;

    // Halsey equation: EMC = [ -ln(1 - RH) / (A * (T + C)) ] ^ (1 / B)
    try {
      const numerator = -Math.log(1 - rhDecimal);
      const denominator = this.CONST_A * (tempC + this.CONST_C);
      const rawEmc = Math.pow(numerator / denominator, 1 / this.CONST_B);

      // Giới hạn kết quả thực tế thông thường của thóc (8% - 25%)
      const boundedEmc = Math.max(5.0, Math.min(30.0, rawEmc));
      return Math.round(boundedEmc * 10) / 10;
    } catch (e) {
      // Fallback xấp xỉ tuyến tính khi có lỗi toán học
      return Math.round((0.15 * rhPercent + 0.1 * tempC) * 10) / 10;
    }
  }
}
