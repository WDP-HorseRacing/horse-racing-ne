import { BadRequestException, ConflictException } from '@nestjs/common';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { MedicalVisitConclusion } from '../constants/medical-visit.enum';
import {
  assertCaseCancellableByEdit,
  assertCaseOpenableByEdit,
  assertClosedCaseEdit,
  assertClosedCaseInjuriesHealed,
  assertFollowUpEditFields,
  assertInjuryEdits,
  assertVisitEditable,
  assertVisitEditHasChanges,
  resolveConclusionChange,
  resolveEditHealth,
} from './medical-visit-edit.policy';

describe('medical-visit-edit.policy', () => {
  it('needs a field to edit besides the reason and the abnormal confirmation', () => {
    expect(() =>
      assertVisitEditHasChanges({
        reason: 'x',
        confirmAbnormal: true,
        diagnosis: undefined,
      }),
    ).toThrow(new BadRequestException('Không có nội dung nào để sửa'));
    expect(() =>
      assertVisitEditHasChanges({ reason: 'x', diagnosis: null }),
    ).not.toThrow();
  });

  it('refuses to edit a voided visit', () => {
    expect(() => assertVisitEditable(new Date())).toThrow(ConflictException);
    expect(() => assertVisitEditable(null)).not.toThrow();
  });

  it('keeps kind, conclusion and initial diagnosis out of a follow-up visit', () => {
    expect(() => assertFollowUpEditFields(true, { kind: 'ROUTINE' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertFollowUpEditFields(true, { initialDiagnosis: 'x' }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertFollowUpEditFields(false, { conclusion: 'ISSUE' }),
    ).not.toThrow();
  });

  it('limits a visit of a closed case', () => {
    const closed = {
      caseClosed: true,
      setsNextVisit: false,
      addedRequestCount: 0,
    };
    expect(() =>
      assertClosedCaseEdit({ ...closed, setsNextVisit: true }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertClosedCaseEdit({ ...closed, addedRequestCount: 1 }),
    ).toThrow(ConflictException);
    expect(() => assertClosedCaseEdit(closed)).not.toThrow();
    expect(() =>
      assertClosedCaseEdit({
        caseClosed: false,
        setsNextVisit: true,
        addedRequestCount: 1,
      }),
    ).not.toThrow();
  });

  it('tells what a conclusion change does to the case', () => {
    const { NORMAL, ISSUE } = MedicalVisitConclusion;
    expect(resolveConclusionChange(NORMAL, NORMAL)).toBe('NONE');
    expect(resolveConclusionChange(NORMAL, ISSUE)).toBe('OPEN_CASE');
    expect(resolveConclusionChange(ISSUE, NORMAL)).toBe('CANCEL_CASE');
  });

  it('opens a case only when the horse has none open and no later visit exists', () => {
    expect(() =>
      assertCaseOpenableByEdit({ hasOpenCase: true, laterVisitCount: 0 }),
    ).toThrow(ConflictException);
    expect(() =>
      assertCaseOpenableByEdit({ hasOpenCase: false, laterVisitCount: 1 }),
    ).toThrow(
      new ConflictException(
        'Đã có buổi khám sau buổi này, hãy ghi buổi khám mới để mở bệnh án',
      ),
    );
    expect(() =>
      assertCaseOpenableByEdit({ hasOpenCase: false, laterVisitCount: 0 }),
    ).not.toThrow();
  });

  it('cancels the case only while it is open and has no other visit', () => {
    expect(() =>
      assertCaseCancellableByEdit(MedicalCaseStatus.CLOSED, 0),
    ).toThrow(ConflictException);
    expect(() =>
      assertCaseCancellableByEdit(MedicalCaseStatus.OPEN, 1),
    ).toThrow(ConflictException);
    expect(() =>
      assertCaseCancellableByEdit(MedicalCaseStatus.OPEN, 0),
    ).not.toThrow();
  });

  describe('assertInjuryEdits', () => {
    const base = {
      edits: [] as Array<{ injuryId: string; changesFixedInfo: boolean }>,
      removedIds: [] as string[],
      firstDetectedHere: new Map([
        ['new', true],
        ['old', false],
      ]),
      otherMarkerCounts: new Map<string, number>(),
    };

    it('accepts status edits on any injury of the visit and fixed info on one found here', () => {
      expect(() =>
        assertInjuryEdits({
          ...base,
          edits: [
            { injuryId: 'old', changesFixedInfo: false },
            { injuryId: 'new', changesFixedInfo: true },
          ],
        }),
      ).not.toThrow();
    });

    it.each([
      [
        'an injury outside the visit',
        { edits: [{ injuryId: 'x', changesFixedInfo: false }] },
      ],
      [
        'the same injury twice',
        {
          edits: [{ injuryId: 'new', changesFixedInfo: false }],
          removedIds: ['new'],
        },
      ],
      [
        'fixed info of an injury found earlier',
        { edits: [{ injuryId: 'old', changesFixedInfo: true }] },
      ],
      ['removing an injury found earlier', { removedIds: ['old'] }],
    ])('answers bad request for %s', (_label, input) => {
      expect(() => assertInjuryEdits({ ...base, ...input })).toThrow(
        BadRequestException,
      );
    });

    it('answers conflict when another visit recorded the removed injury', () => {
      expect(() =>
        assertInjuryEdits({
          ...base,
          removedIds: ['new'],
          otherMarkerCounts: new Map([['new', 1]]),
        }),
      ).toThrow(ConflictException);
    });
  });

  it('keeps edited injuries healed in a closed case', () => {
    expect(() =>
      assertClosedCaseInjuriesHealed(true, [RecoveryStatus.RECOVERING]),
    ).toThrow(ConflictException);
    expect(() =>
      assertClosedCaseInjuriesHealed(true, [RecoveryStatus.HEALED]),
    ).not.toThrow();
    expect(() =>
      assertClosedCaseInjuriesHealed(false, [RecoveryStatus.ACUTE]),
    ).not.toThrow();
  });

  it('decides the health of the horse when the result of a visit is edited', () => {
    const { ELIGIBLE, INJURED, QUARANTINED } = HorseHealthStatus;
    const decide = (
      nextStatus: HorseHealthStatus,
      currentStatus: HorseHealthStatus,
      hasLaterChange: boolean,
    ) =>
      resolveEditHealth({
        resultingStatus: INJURED,
        nextStatus,
        currentStatus,
        hasLaterChange,
      });
    expect(decide(INJURED, ELIGIBLE, true)).toBe('UNCHANGED');
    expect(decide(QUARANTINED, INJURED, false)).toBe('UPDATED');
    expect(decide(QUARANTINED, INJURED, true)).toBe('KEPT_LATER_CHANGE');
    expect(decide(QUARANTINED, ELIGIBLE, false)).toBe('KEPT_LATER_CHANGE');
  });
});
