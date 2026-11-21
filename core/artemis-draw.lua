-- MeguLit draw: the game's own bilingual layout (engine-draw, docs/engine-draw-native.md, Artemis section)
-- Appended to system/image/boot.lua inside MeguLit's added archive (core/artemis-language.cjs, with the E591 "ja" lines):
-- boot.lua is read after msg/message.lua and msg/lang.lua, so every function wrapped here is the game's own one. The main
-- language stays Japanese (E591), with the game's own {"ruby"} marks; the sub language is the release's Chinese track,
-- which the engine draws itself in its adv_sub layer right under the main text (message_control). Every wrapper falls
-- back to the game's function; nothing of the game's files, saves or config is written.
do
	local MEGULIT_SUB   = "@SUB@"	-- the release's Chinese track (cn or tw)
	local MEGULIT_SCALE = @SCALE@	-- sub text size against the main text

	if type(init) == "table" then init.game_sublangview = "on" end

	-- the sub language
	local megulit_getsub = get_sub_lang
	function get_sub_lang()
		if type(init) == "table" then init.game_sublangview = "on" end
		return MEGULIT_SUB
	end

	-- the sub pass reads its own track (this build's mw_textloop always reads the main language)
	local megulit_pass = nil
	local megulit_tbf = getTextBlockFloat
	function getTextBlockFloat(p, mode)
		if megulit_pass and type(p) == "table" and type(p[megulit_pass]) == "table" then
			local z = p.float or {}
			for i, v in ipairs(p[megulit_pass]) do
				if not mode and not z[i] or z[i] and z[i].mode == mode then return v end
			end
			return nil
		end
		return megulit_tbf(p, mode)
	end
	local megulit_loop = mw_textloop
	function mw_textloop(p)
		megulit_pass = (type(p) == "table" and p.lang == MEGULIT_SUB) and MEGULIT_SUB or nil
		local ok, err = pcall(megulit_loop, p)
		megulit_pass = nil
		if not ok then error(err, 0) end
	end

	-- a sub window font the game never defined (subNN): its main window font (advNN) in the sub language, smaller, no ruby
	local megulit_font = get_fontdata
	function get_fontdata(name, mode)
		pcall(function()
			local nx = type(name) == "string" and name:match("^sub(%d%d)$")
			local t  = type(lang) == "table" and lang.font
			if not nx or type(t) ~= "table" or t[name] then return end
			local src = t["adv"..nx] or t["adv01"]
			if type(src) ~= "table" then return end
			local base = type(src[MEGULIT_SUB]) == "table" and src[MEGULIT_SUB] or src
			local d = {}
			for k, v in pairs(base) do if type(v) ~= "table" then d[k] = v end end
			if type(d.size) == "number" then d.size = math.floor(d.size * MEGULIT_SCALE + 0.5) end
			d.ruby, d.rubysize = nil, 0
			local per, any = {}, false
			for k, v in pairs(src) do if type(v) == "table" then per[k] = d any = true end end
			t[name] = any and per or d
		end)
		return megulit_font(name, mode)
	end
end
