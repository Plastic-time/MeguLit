@echo off
call "E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
set "INCLUDE=%VCToolsInstallDir%atlmfc\include;%INCLUDE%"
set "LIB=%VCToolsInstallDir%atlmfc\lib\x86;%LIB%"
set "PATH=E:\Apps\work\euphoria-test-build\build-deps\bin;%PATH%"
"E:\Apps\work\euphoria-test-build\build-deps\cmake\data\bin\cmake.exe" -S "E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook" -B "E:\Apps\work\megulithook\build-x86" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_HOST=OFF -DBUILD_HOOK=ON -DWIN10ABOVE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_MAKE_PROGRAM="E:\Apps\work\euphoria-test-build\build-deps\bin\ninja.exe" -DFETCHCONTENT_SOURCE_DIR_MINHOOK="E:\Apps\work\euphoria-test-build\build-x86\_deps\minhook-src" -DFETCHCONTENT_FULLY_DISCONNECTED=ON || exit /b 1
"E:\Apps\work\euphoria-test-build\build-deps\cmake\data\bin\cmake.exe" --build "E:\Apps\work\megulithook\build-x86" --target LunaHook --parallel 8
