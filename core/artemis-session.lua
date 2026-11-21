-- SPDX-License-Identifier: GPL-3.0-or-later
-- Session-only boot tail. No rendering, save, network or native API is changed.
do
 local key, nonce, controlPath, outputPath, savePath = @KEY@, @NONCE@, @CONTROL@, @OUTPUT@, @SAVE@
 if rawget(_G, key) == nil then
  local state = {sequence=-1, seenAt=nil, closed=false, installing=false}
  local loader = (function() @OBSERVER@ end)()
  local function clock()
   if type(e) ~= 'table' and type(e) ~= 'userdata' then return nil end
   local ok, n = pcall(function() return e:now() end)
   if ok and type(n) == 'number' and n >= 0 and n == n and n < 1e15 then return n end
  end
  local function control()
   if state.closed then return {enabled=false,generation=0} end
   local ok, save = pcall(function() return e:var('s.savepath') end)
   if not ok or type(save) ~= 'string' then return {enabled=false,generation=0} end
   save = save:gsub('\\', '/'):gsub('/+$', ''):lower()
   if save ~= savePath:lower() and save ~= 'savedata' then return {enabled=false,generation=0} end
   local fp = io.open(controlPath, 'rb')
   if not fp then return {enabled=false,generation=0} end
   local s = fp:read(513); fp:close()
   local n, g, q, on
   if type(s) == 'string' and #s <= 512 then n, g, q, on = s:match('^MeguLitArtemis1 ([0-9a-f]+) (%d+) (%d+) ([01])\n$') end
   local now = clock(); g, q = tonumber(g), tonumber(q)
   if n ~= nonce or not g or g > 2147483647 or not q or q > 2147483647 or not now or q < state.sequence then return {enabled=false,generation=0} end
   if q > state.sequence then state.sequence, state.seenAt = q, now end
   if not state.seenAt or now < state.seenAt or now - state.seenAt > 4000 then return {enabled=false,generation=g} end
   return {enabled=on == '1',generation=g}
  end
  local function quote(s)
   return '"'..s:gsub('[%z\1-\31\\"]', function(c) return string.format('\\u%04x', c:byte()) end)..'"'
  end
  local function sink(event)
   local spans = {}
   for _, r in ipairs(event.ruby or {}) do spans[#spans+1] = '['..r[1]..','..r[2]..','..quote(r[3])..']' end
   local data = '{"nonce":'..quote(nonce)..',"generation":'..event.generation..',"role":'..quote(event.role)..',"text":'..quote(event.text)..',"ruby":['..table.concat(spans, ',')..']'
   if event.id then data = data..',"id":'..quote(event.id)..',"variant":'..quote(event.variant) end
   data = data..'}\n'
   if #data > 65536 then state.closed = true return end
   local fp = io.open(outputPath, 'ab')
   if not fp then state.closed = true return end
   local size = fp:seek('end')
   if not size or size + #data > 2097152 then fp:close(); state.closed = true return end
   local ok = fp:write(data); fp:close()
   if not ok then state.closed = true end
  end
  local boot, originals = {}, {}
  local function tryInstall()
   if state.handle or state.closed or state.installing then return state.handle ~= nil end
   for _, name in ipairs({'getTextBlockFloat','mw_textloop','message_name','ui_message','select_message','getMWID'}) do
    if type(rawget(_G, name)) ~= 'function' then return false end
   end
   if not control().enabled then return false end
   state.installing = true
   for name, fn in pairs(boot) do if rawget(_G, name) == fn then rawset(_G, name, originals[name]) end end
   local ok, handle = pcall(loader, _G, control, sink)
   state.installing = false
   if ok and handle then
    state.handle = handle
    state.installed = {}
    for _, name in ipairs({'mw_textloop','message_name','select_message'}) do state.installed[name] = rawget(_G, name) end
    local p = control()
    if p.enabled then pcall(sink, {generation=p.generation,role='status',text='installed',ruby={}}) end
    return true
   end
   for name, fn in pairs(boot) do if rawget(_G, name) == originals[name] then rawset(_G, name, fn) end end
   return false
  end
  state.tryInstall = tryInstall
  state.arm = function()
   if state.handle then state.handle.dispose(); state.handle = nil end
   state.installed = nil
   for name, fn in pairs(boot) do if rawget(_G, name) == fn then rawset(_G, name, originals[name]) end end
   boot, originals = {}, {}
   for _, name in ipairs({'mw_textloop','message_name','select_message'}) do
    local fn = rawget(_G, name)
    if type(fn) == 'function' and fn ~= boot[name] and not state.handle then
     originals[name] = fn
     local wrapped
     wrapped = function(...)
      pcall(tryInstall)
      local next = rawget(_G, name)
      if boot[name] == wrapped and state.installed and state.installed[name] == next then return next(...) end
      return fn(...)
     end
     boot[name] = wrapped; rawset(_G, name, wrapped)
    end
   end
   tryInstall()
  end
  rawset(_G, key, state)
 end
 local state = rawget(_G, key)
 if type(state) == 'table' and type(state.arm) == 'function' then pcall(state.arm) end
end
