# SPDX-License-Identifier: GPL-3.0-or-later
# Installed exclusively in the collector-owned copy before the game starts
init -999 python in megulit_dialogue:
    from store import config
    from renpy.exports import get_screen_variable
    import ctypes
    import msvcrt
    import json
    import os
    import re

    def install():
        challenge = os.environ.get("MEGULIT_GAME_SESSION", "")
        if not re.fullmatch("[a-f0-9]{64}", challenge):
            return
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateNamedPipeW.restype = ctypes.c_void_p
        # Outbound only, first instance, local clients, nonblocking writes.
        handle = kernel.CreateNamedPipeW(r"\\.\pipe\LOCAL\megulit-dialogue-" + challenge,
                                         0x80002, 9, 1, 65536, 0, 0, None)
        if handle == ctypes.c_void_p(-1).value:
            return
        stream = os.fdopen(msvcrt.open_osfhandle(handle, os.O_WRONLY | os.O_BINARY), "wb", buffering=0)
        sequence = 0
        error_logged = False

        stages_seen = set()
        def mark_stage(stage):
            if stage in stages_seen:
                return
            stages_seen.add(stage)
            log_base = os.environ.get("RENPY_LOG_BASE")
            if log_base:
                try:
                    with open(os.path.join(log_base, "cardinal-dialogue-stages.log"), "a", encoding="ascii") as log:
                        log.write(stage + "\n")
                except OSError:
                    pass

        def observe(event, interact=True, what=None, last_segment=None, **kwargs):
            nonlocal stream, sequence, error_logged
            if event != "show_done" or not interact or last_segment is False:
                return
            mark_stage("show_done")
            if what is None:
                try:
                    what = get_screen_variable("what", screen="say")
                except (NameError, ValueError):
                    return
            if not isinstance(what, str) or not what.strip():
                return
            mark_stage("text_ready")
            sequence += 1
            try:
                frame = dict(challenge=challenge, sequence=sequence, text=what)
                data = json.dumps(frame, ensure_ascii=False).encode("utf-8") + b"\n"
                if len(data) <= 32768 and stream.write(data) == len(data):
                    mark_stage("sent")
            except OSError as error:
                if not error_logged:
                    try:
                        with open(os.path.join(os.environ["RENPY_LOG_BASE"], "cardinal-dialogue-error.txt"), "x") as out:
                            out.write(str(error))
                    except OSError:
                        pass
                    error_logged = True


        config.all_character_callbacks.append(observe)
        mark_stage("registered")

    install()
