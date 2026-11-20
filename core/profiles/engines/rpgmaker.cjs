// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: RPG Maker MV / MZ (rpg_windows.js / rmmz_windows.js). Only keys of core/profiles/defaults.cjs.
   Draw roles by window class (core/draw-role.cjs walks the class chain, own class first, so a plugin window that extends one of
   these inherits its role; a plugin window on Window_Base / Window_Selectable alone is named in that game's diff):
     line    Window_Message (show text), Window_ScrollText (scrolling text pages)
     choice  Window_ChoiceList, Window_NumberInput, Window_EventItem (what the event asks the player)
     menu    Window_Command and every command / list window (title, menu, shop, items, skills, equip, options, save files,
             battle commands); Window_Selectable as the base of all of them
     name    Window_NameBox (the speaker's name)
     system  help line, gold, map name, status pages, battle log, name input */
const LINE=['Window_Message','Window_ScrollText'];
const CHOICE=['Window_ChoiceList','Window_NumberInput','Window_EventItem'];
const MENU=['Window_Command','Window_HorzCommand','Window_Selectable','Window_TitleCommand','Window_MenuCommand',
 'Window_ItemCategory','Window_ItemList','Window_SkillType','Window_SkillList','Window_EquipCommand','Window_EquipSlot','Window_EquipItem',
 'Window_Options','Window_SavefileList','Window_ShopCommand','Window_ShopBuy','Window_ShopSell','Window_ShopNumber',
 'Window_GameEnd','Window_PartyCommand','Window_ActorCommand','Window_BattleActor','Window_BattleEnemy',
 'Window_BattleSkill','Window_BattleItem','Window_MenuStatus','Window_MenuActor','Window_BattleStatus','Window_DebugRange','Window_DebugEdit','Window_NameInput'];
const NAME=['Window_NameBox'];
const SYSTEM=['Window_Help','Window_Gold','Window_MapName','Window_Status','Window_StatusBase','Window_StatusParams',
 'Window_StatusEquip','Window_SkillStatus','Window_EquipStatus','Window_ShopStatus','Window_BattleLog','Window_NameEdit','Window_Base'];
const roleMap={};for(const [list,role] of [[LINE,'line'],[CHOICE,'choice'],[MENU,'menu'],[NAME,'name'],[SYSTEM,'system']])for(const c of list)roleMap['class:'+c]=role;
module.exports={
 engine:'rpgmaker',
 settings:{draw:{roleMap}},
};
