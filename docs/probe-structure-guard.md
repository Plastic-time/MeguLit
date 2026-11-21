# Probe sample structure guard

Privacy masking can destroy technical bytes while leaving a sample with no opaque blocks. Two synthetic controls reproduce this: a 52-byte ADVSCRIPT2 text command and a 464-byte Cotopha header plus neutral UTF-16 data. A successful privacy check alone does not establish that a sample remains usable

`desensitize.sampleResult()` returns `{sample, reason, structure}`. The existing `sample()` and `adapter-sample.scriptSample()` interfaces still return a sample or null. No callback runs during sampling

The guard has two narrow checks:

- Exact `NEKOSDK_ADVSCRIPT2` magic followed by at least one supported text-display record. Protect the magic, exact command bytes, length words and string terminators. Require two bounded NUL-terminated fields. Scan at most 2 MiB and 4,096 records. Input beyond those limits is dropped before masking
- Exact `Entis` signature and `Cotopha Image file` identifier at their known offsets. Require and protect the first 64 bytes. This checks header preservation only, without certifying the image records or bytecode

Missing record structure or incomplete coverage of protected bytes returns `STRUCTURE_UNSUPPORTED`. A changed protected byte returns `STRUCTURE_CHANGED`. Exceeded scan limits return `STRUCTURE_BUDGET`. Existing privacy rejection remains `VERIFY`. These fixed reasons contain no input text

All masking, residual-kana checks and privacy verification remain in force. Original Japanese command bytes are never restored into a sample. The guard does not decompress input or certify unknown formats, arbitrary script commands, complete game text, engine identity or parser support

Archive sampling drops the whole item after a recognized structure rejection. It cannot retry that item as independent 64 KiB blocks. The existing S5 block fallback remains available for unrelated formats. Script sampling and runtime publicize use the same result contract. Dropped items have no sample payload, raw count or packed count; the adapter manifest includes the fixed reason and completeness excludes that payload

`validation/probe-structure.test.cjs` uses neutral synthetic bytes and the actual adapter prepare, bundle, manifest, completeness and runtime publicize methods with controlled dependencies. It does not run a game, upload a probe, or establish that issues 750 and 751 are fixed
