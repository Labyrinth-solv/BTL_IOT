import { RiskLevel, AlertType, AlertSeverity } from '@prisma/client';

export interface EvaluationInput {
  temperature: number;
  humidity_air: number;
  gas_ppm: number;
  estimated_emc: number;
  custom_config?: any;
}

export interface RuleEngineResult {
  risk_level: RiskLevel;
  should_turn_on_fan: boolean;
  alert_needed: boolean;
  alert_type?: AlertType;
  alert_severity?: AlertSeverity;
  alert_message?: string;
  trigger_value?: number;
}

export class RuleEngineService {
  /**
   * Đánh giá dữ liệu vi khí hậu và phân loại mức độ rủi ro kho ngũ cốc
   */
  static evaluate(input: EvaluationInput): RuleEngineResult {
    const { temperature, humidity_air, gas_ppm, estimated_emc, custom_config } = input;

    // Ngưỡng tiêu chuẩn hoặc lấy từ cấu hình riêng của thiết bị
    const cfg = custom_config || {};
    const rhWarnThreshold = cfg.hum_warn_threshold ?? 65.0;
    const rhCritThreshold = cfg.hum_crit_threshold ?? 70.0;
    const tempWarnThreshold = cfg.temp_warn_threshold ?? 25.0;
    const tempCritThreshold = cfg.temp_crit_threshold ?? 28.0;
    const gasWarnThreshold = cfg.gas_warn_threshold ?? 600.0;
    const gasCritThreshold = cfg.gas_crit_threshold ?? 700.0;
    const emcWarnThreshold = cfg.emc_warn_threshold ?? 14.0;
    const emcCritThreshold = cfg.emc_crit_threshold ?? 14.8;

    // 1. KIỂM TRA HIGH_RISK (CRITICAL)
    if (humidity_air > rhCritThreshold) {
      return {
        risk_level: RiskLevel.HIGH_RISK,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.HIGH_HUMIDITY,
        alert_severity: AlertSeverity.CRITICAL,
        alert_message: `Độ ẩm không khí tăng vọt nguy hiểm (${humidity_air}%RH > ${rhCritThreshold}%RH). Nguy cơ mốc và độc tố vi nấm cực cao!`,
        trigger_value: humidity_air,
      };
    }

    if (gas_ppm >= gasCritThreshold) {
      return {
        risk_level: RiskLevel.HIGH_RISK,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.GAS_SPIKE,
        alert_severity: AlertSeverity.CRITICAL,
        alert_message: `Nồng độ khí gas vượt ngưỡng báo động (${gas_ppm} ppm >= ${gasCritThreshold} ppm). Hạt ẩm đang lên men yếm khí tự bốc nóng!`,
        trigger_value: gas_ppm,
      };
    }

    if (temperature > tempCritThreshold) {
      return {
        risk_level: RiskLevel.HIGH_RISK,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.HIGH_TEMP,
        alert_severity: AlertSeverity.CRITICAL,
        alert_message: `Nhiệt độ kho vượt ngưỡng nguy hiểm (${temperature}°C > ${tempCritThreshold}°C). Điểm bốc nóng cục bộ!`,
        trigger_value: temperature,
      };
    }

    if (estimated_emc > emcCritThreshold) {
      return {
        risk_level: RiskLevel.HIGH_RISK,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.HIGH_HUMIDITY,
        alert_severity: AlertSeverity.CRITICAL,
        alert_message: `Độ ẩm cân bằng hạt vượt ngưỡng an toàn nghiêm trọng (${estimated_emc}%MC > ${emcCritThreshold}%MC).`,
        trigger_value: estimated_emc,
      };
    }

    // 2. KIỂM TRA WARNING (CẢNH BÁO)
    if (humidity_air > rhWarnThreshold) {
      return {
        risk_level: RiskLevel.WARNING,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.HIGH_HUMIDITY,
        alert_severity: AlertSeverity.WARNING,
        alert_message: `Độ ẩm không khí ở mức cảnh báo (${humidity_air}%RH > ${rhWarnThreshold}%RH). Đang bật quạt thông gió đối lưu.`,
        trigger_value: humidity_air,
      };
    }

    if (gas_ppm >= gasWarnThreshold) {
      return {
        risk_level: RiskLevel.WARNING,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.GAS_SPIKE,
        alert_severity: AlertSeverity.WARNING,
        alert_message: `Phát hiện nồng độ khí gas tăng nhẹ (${gas_ppm} ppm >= ${gasWarnThreshold} ppm).`,
        trigger_value: gas_ppm,
      };
    }

    if (temperature > tempWarnThreshold) {
      return {
        risk_level: RiskLevel.WARNING,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.HIGH_TEMP,
        alert_severity: AlertSeverity.WARNING,
        alert_message: `Nhiệt độ khối hạt cao hơn mức tối ưu (${temperature}°C > ${tempWarnThreshold}°C). Nguy cơ côn trùng mọt hoạt động.`,
        trigger_value: temperature,
      };
    }

    if (estimated_emc > emcWarnThreshold) {
      return {
        risk_level: RiskLevel.WARNING,
        should_turn_on_fan: true,
        alert_needed: true,
        alert_type: AlertType.HIGH_HUMIDITY,
        alert_severity: AlertSeverity.WARNING,
        alert_message: `Độ ẩm cân bằng hạt tăng nhẹ (${estimated_emc}%MC > ${emcWarnThreshold}%MC).`,
        trigger_value: estimated_emc,
      };
    }

    // 3. AN TOÀN (SAFE)
    return {
      risk_level: RiskLevel.SAFE,
      should_turn_on_fan: false,
      alert_needed: false,
    };
  }
}
