-- SPDX-License-Identifier: GPL-3.0-or-later
-- Semantic input diagnostics only. This module does not install a transport or prove rendering.
return function(env, control, sink, identity)
	if type(env) ~= 'table' or type(control) ~= 'function' or type(sink) ~= 'function' then return nil, 'API' end
	local names = {'getTextBlockFloat', 'mw_textloop', 'message_name', 'ui_message', 'select_message', 'getMWID'}
	local original, wrapped = {}, {}
	for _, name in ipairs(names) do
		if type(rawget(env, name)) ~= 'function' then return nil, 'API' end
		original[name] = rawget(env, name)
	end
	local live, greatest, retired = true, -1, false
	local function permission()
		if not live then return nil end
		local ok, p = pcall(control)
		if not ok or type(p) ~= 'table' or type(rawget(p, 'enabled')) ~= 'boolean' then retired = true return nil end
		local g = rawget(p, 'generation')
		if type(g) ~= 'number' or g < 0 or g > 2147483647 or g ~= math.floor(g) or g < greatest then retired = true return nil end
		if g > greatest then greatest, retired = g, false end
		if not rawget(p, 'enabled') then retired = true return nil end
		return not retired and g or nil
	end
	if permission() == nil then return nil, 'DISABLED' end
	local function pack(...) return {n=select('#', ...), ...} end
	local function invoke(fn, ...)
		return pack(pcall(fn, ...))
	end
	local function finish(r)
		if not r[1] then error(r[2], 0) end
		return unpack(r, 2, r.n)
	end
	local function count(s, limit, newline)
		if type(s) ~= 'string' or #s > limit * 4 then return nil end
		local i, n = 1, 0
		while i <= #s do
			local a, b = s:byte(i), s:byte(i + 1)
			local width = a < 128 and 1 or a >= 194 and a <= 223 and 2 or a >= 224 and a <= 239 and 3 or a >= 240 and a <= 244 and 4 or nil
			if not width or i + width - 1 > #s or a < 32 and not (newline and a == 10) or a == 127 then return nil end
			for j = i + 1, i + width - 1 do local x = s:byte(j) if x < 128 or x > 191 then return nil end end
			if width == 3 and (a == 224 and b < 160 or a == 237 and b >= 160) or width == 4 and (a == 240 and b < 144 or a == 244 and b >= 144) then return nil end
			i, n = i + width, n + 1
			if n > limit then return nil end
		end
		return n
	end
	local function rowSnapshot(row)
		if type(row) ~= 'table' or getmetatable(row) ~= nil then return nil end
		local max, keys = 0, 0
		for k in pairs(row) do
			keys = keys + 1
			if keys > 257 then return nil end
			if type(k) == 'number' then
				if k < 1 or k > 256 or k ~= math.floor(k) then return nil end
				max = math.max(max, k)
			elseif k ~= 'name' then return nil end
		end
		local pieces, ruby, offset, pending = {}, {}, 0, nil
		for i = 1, max do
			local v = rawget(row, i)
			if type(v) == 'string' then
				local n = count(v, 2048, true)
				if not n or offset + n > 2048 then return nil end
				pieces[#pieces + 1], offset = v, offset + n
			elseif type(v) == 'table' and getmetatable(v) == nil then
				local tag = rawget(v, 1)
				if tag == 'ruby' then
					local reading = rawget(v, 'text')
					local n = count(reading, 160, false)
					if pending or not n or n == 0 then return nil end
					pending = {offset, reading}
				elseif tag == '/ruby' then
					if not pending or offset <= pending[1] or offset - pending[1] > 80 or #ruby >= 64 then return nil end
					ruby[#ruby + 1] = {pending[1], offset - pending[1], pending[2]}
					pending = nil
				elseif tag == 'rt2' then
					if pending or offset >= 2048 then return nil end
					pieces[#pieces + 1], offset = '\n', offset + 1
				elseif tag ~= 'font' and tag ~= '/font' then return nil end
			else return nil end
		end
		if pending or offset == 0 then return nil end
		return {text=table.concat(pieces), ruby=ruby}
	end
	local function emit(g, event)
		if g == nil or permission() ~= g then return end
		event.kind, event.stage, event.identity, event.generation = 'artemis-input-v1', 'input', identity, g
		pcall(sink, event)
	end
	local current, selection = nil, nil
	wrapped.getMWID = function(name, ...)
		local r = invoke(original.getMWID, name, ...)
		if selection and r[1] and name == 'select' and type(r[2]) == 'string' and #r[2] <= 96 then selection.prefix = r[2]..'.' end
		return finish(r)
	end
	wrapped.getTextBlockFloat = function(...)
		local r = invoke(original.getTextBlockFloat, ...)
		if current and current.generation ~= nil and permission() == current.generation and r[1] and not current.captured then
			current.captured, current.snapshot = true, rowSnapshot(r[2])
		end
		return finish(r)
	end
	wrapped.mw_textloop = function(p, ...)
		local previous = current
		local f = {generation=permission(), language=type(p) == 'table' and rawget(p, 'lang') or nil}
		current = f
		local r = invoke(original.mw_textloop, p, ...)
		current = previous
		if r[1] and f.language == 'ja' and f.snapshot then
			f.snapshot.role, f.snapshot.language = 'line', f.language
			emit(f.generation, f.snapshot)
		end
		return finish(r)
	end
	wrapped.message_name = function(text, ...)
		local g = permission()
		local valid = g ~= nil and (text == nil or count(text, 256, false) ~= nil)
		local r = invoke(original.message_name, text, ...)
		if r[1] and valid then emit(g, {role='name', text=text or '', clear=text == nil}) end
		return finish(r)
	end
	wrapped.ui_message = function(id, p, ...)
		local selected = selection
		local event
		if selected and not selected.invalid and selected.generation ~= nil and permission() == selected.generation and type(id) == 'string' and #id <= 128 and type(p) == 'table' and getmetatable(p) == nil then
			local font, text = rawget(p, 1), rawget(p, 'text')
			local prefix, variant = selected.prefix, id:match('%.([23])$')
			local number = prefix and id:sub(1, #prefix) == prefix and id:sub(#prefix + 1):match('^(%d+)%.0%.0%.[23]$')
			local validFont = variant == '3' and font == 'select_active' or variant == '2' and (font == 'select' or font == 'select_aread' or font == 'select_disable')
			if number and tonumber(number) >= 1 and tonumber(number) <= 64 and validFont and count(text, 1024, false) then
				event = {role='choice', id=id, text=text, variant=variant == '3' and 'hover' or 'normal'}
			end
		end
		local r = invoke(original.ui_message, id, p, ...)
		if r[1] and event then
			if #selected.events >= 64 then selected.invalid = true else selected.events[#selected.events + 1] = event end
		end
		return finish(r)
	end
	wrapped.select_message = function(...)
		local previous = selection
		local f = {generation=permission(), events={}}
		selection = f
		local r = invoke(original.select_message, ...)
		selection = previous
		if r[1] and not f.invalid then for _, event in ipairs(f.events) do emit(f.generation, event) end end
		return finish(r)
	end
	local handle = {dispose=function()
		if not live then return end
		live, current, selection = false, nil, nil
		for _, name in ipairs(names) do if rawget(env, name) == wrapped[name] then rawset(env, name, original[name]) end end
	end}
	for _, name in ipairs(names) do rawset(env, name, wrapped[name]) end
	return handle
end
