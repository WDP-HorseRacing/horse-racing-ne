export enum HorseMeasurementType {
  WEIGHT = 'WEIGHT',
  HEIGHT = 'HEIGHT',
  BODY_CONDITION = 'BODY_CONDITION',
  TEMPERATURE = 'TEMPERATURE',
}

export interface HorseMeasurementSpec {
  unit: string;
  min: number;
  max: number;
}

export const HORSE_MEASUREMENT_SPECS: Record<
  HorseMeasurementType,
  HorseMeasurementSpec
> = {
  [HorseMeasurementType.WEIGHT]: { unit: 'kg', min: 30, max: 1500 },
  [HorseMeasurementType.HEIGHT]: { unit: 'cm', min: 50, max: 250 },
  [HorseMeasurementType.BODY_CONDITION]: { unit: 'score', min: 1, max: 9 },
  [HorseMeasurementType.TEMPERATURE]: { unit: 'celsius', min: 30, max: 45 },
};
