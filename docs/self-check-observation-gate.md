# Hide calibration requires observations

`SelfCheck.pass` means no measured metric exceeded its limit. It does not mean every metric was observed. Missing hide, position and pairing samples remain `null`

`auto-profile.calibrate` now separately checks hide candidate eligibility: at least `selfCheck.minLines` source lines, actual reader drawing, and non-null hide visibility, position and pairing measurements. The existing SelfCheck sample minima and failure thresholds remain unchanged. A candidate with missing observations cannot pass hide calibration; its `missing` array names the absent measurements. A sufficient measured candidate still uses the existing cost and least-change ordering

When none qualifies, calibration selects its existing basic read candidate and reports the measured failures and/or `观测不足` with the missing measurement names. Null values are retained in candidate diagnostics. Unencountered choices do not require inventing a choice sample; encountered choice mismatches still use the existing threshold

This does not issue native hide commands, switch the user's hook profile, override signed or verified seeds, rewrite historical files, or change Cardinal reliability. GalNative continues to treat the read setting as a suggestion under its existing manual mode contract

The local live service also checks existing `source=calibration, mode=hide` records before use. An old record remains eligible without new fields when its existing score contains sufficient integer line count and finite valid hide/position/pair measurements, plus a measured repeat rate. The latter is legacy evidence of reader drawing: SelfCheck only calculates repeatRate when drawn lines exist. Old metric values attest their original sample minima; missing count fields are not grounds to invalidate all historical records. This is evidence eligibility, not authentication of local JSON

An unmeasured local hide record is ignored in memory, logs a pending-recalibration reason and leaves the current recording open. The file is neither deleted nor rewritten by admission. `choose` and `inputOf` repeat the check so a directly supplied stale record cannot restore the ignored layer. Normal future calibration can persist its newly measured result. Manual records, gate step-downs, read records, official/shared signatures and verified seeds retain their existing behavior and precedence

The existing Senren replay has measured hide and pair values but no position measurement. Its runtime check still has no measured failure; its calibration can no longer validate hide. The historical stored-hide step-down regression uses an explicit neutral old-record fixture, without inventing position evidence for that real tape

Validation includes source-only, rendered-but-unmeasured, partial and individually missing sensors, minimum lines/drawing, a fully observed positive, measured hide/position/pair negatives and encountered choices. These are offline contract checks, not game or UI acceptance. The cold-test scorer is a separate consumer and was not changed by this local-calibration patch
