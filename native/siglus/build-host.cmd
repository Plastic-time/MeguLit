@echo off
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 -no_logo
set "PATH=E:\Apps\work\euphoria-test-build\build-deps\bin;%PATH%"
"E:\Apps\work\euphoria-test-build\build-deps\cmake\data\bin\cmake.exe" -S "E:\Apps\work\siglus-build\luna-source\src\NativeImpl\LunaHook" -B "E:\Apps\work\siglus-build\build-x64" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_HOST=ON -DBUILD_HOOK=OFF -DWIN10ABOVE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_MAKE_PROGRAM="E:\Apps\work\euphoria-test-build\build-deps\bin\ninja.exe" -DFETCHCONTENT_SOURCE_DIR_MINHOOK="E:\Apps\work\euphoria-test-build\build-x86\_deps\minhook-src" -DFETCHCONTENT_SOURCE_DIR_UCHARDET="E:\Apps\work\siglus-build\uchardet-src" -DFETCHCONTENT_FULLY_DISCONNECTED=ON || exit /b 1
"E:\Apps\work\euphoria-test-build\build-deps\cmake\data\bin\cmake.exe" --build "E:\Apps\work\siglus-build\build-x64" --parallel 4
