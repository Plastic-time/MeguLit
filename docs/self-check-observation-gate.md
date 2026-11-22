# Hide calibration requires observations

`SelfCheck.pass` means no measured metric exceeded its limit. It does not mean every metric was observed. Missing hide, position and pairing samples remain `null`

`auto-profile.calibrate` now separately checks hide candidate eligibility: at least `selfCheck.minLines` source lines, actual reader drawing, and non-null hide visibility, position and pairing measurements. The existing SelfCheck sample minima and failure thresholds remain unchanged. A candidate with missing observations cannot pass hide calibration; its `missing` array names the absent measurements. A sufficient measured candidate still uses the existing cost and least-change ordering

When none qualifies, calibration selects its existing basic read candidate and reports the measured failures and/or `观测不足` with the missing measurement names. Null values are retained in candidate diagnostics. Unencountered choices do not require inventing a choice sample; encountered choice mismatches still use the existing threshold

This changes new local calibration eligibility only. It does not issue native hide commands, switch the user's hook profile, override signed or verified seeds, rewrite historical calibrations, or change Cardinal reliability. GalNative continues to treat the read setting as a suggestion under its existing manual mode contract. Old stored unmeasured calibrations need a separate, explicit revalidation policy; this patch does not silently migrate them

The existing Senren replay has measured hide and pair values but no position measurement. Its runtime check still has no measured failure; its calibration can no longer validate hide. The historical stored-hide step-down regression uses an explicit neutral old-record fixture, without inventing position evidence for that real tape

Validation includes source-only, rendered-but-unmeasured, partial and individually missing sensors, minimum lines/drawing, a fully observed positive, measured hide/position/pair negatives and encountered choices. These are offline contract checks, not game or UI acceptance. The cold-test scorer is a separate consumer and was not changed by this local-calibration patch
