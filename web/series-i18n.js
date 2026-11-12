export const seriesMessages={
 zh:{collection:'系列合集',select:'多选',cancel:'取消多选',selected:n=>`已选 ${n} 部`,create:'创建合集',name:'合集名称',original:'英文／日文原名',developer:'开发商',aliases:'系列别名（一行一个）',count:n=>`${n} 部作品`,
  back:'返回游戏库',manage:'管理合集',add:'添加／移除作品',cover:'更换代表封面',dissolve:'解散合集',dissolveTitle:'解散这个合集？',dissolveHint:'只解除组织关系，游戏、存档、Hook 和学习记录均保留',confirm:'解散',close:'关闭',
  addTo:'添加到合集',remove:'移出合集',empty:'合集暂时没有作品',installed:'已安装',missing:'未安装',sort:'排序',story:'故事推荐顺序',release:'发售时间顺序',nameSort:'游戏名称',recent:'最近游玩',custom:'自定义顺序',
  noStory:'尚无可靠的故事顺序，暂按自定义顺序展示；可在管理中手动填写',noRelease:'部分作品缺少可靠发售日期，排在已有日期的作品后面',orderEdit:'作品顺序与版本',storyNumber:'故事顺序',releaseNumber:'发售顺序（可手动指定）',releaseDate:'发售日期',
  edition:'版本说明',up:'上移',down:'下移',drag:'拖动作品调整顺序',suggest:'系列归类建议',accept:'加入',dismiss:'忽略',failed:'操作未完成，请重试',saved:'已更新合集',choose:'选择作品',noCollections:'暂无合集，可多选游戏创建',
  search:'搜索作品／系列',autoHint:'明确的系列身份会自动归类，模糊匹配只给建议；手动调整优先',unknown:'未设置'},
 ja:{collection:'シリーズ',select:'複数選択',cancel:'選択を解除',selected:n=>`${n} 作品を選択中`,create:'シリーズを作成',name:'シリーズ名',original:'英語／日本語の原題',developer:'開発元',aliases:'別名（1 行に 1 つ）',
  count:n=>`${n} 作品`,back:'ライブラリに戻る',manage:'シリーズを管理',add:'作品を追加・除外',cover:'代表画像を変更',dissolve:'シリーズを解散',dissolveTitle:'シリーズを解散しますか？',dissolveHint:'分類のみ解除します。ゲーム、セーブ、Hook、学習記録は保持します',
  confirm:'解散する',close:'閉じる',addTo:'シリーズに追加',remove:'シリーズから除外',empty:'まだ作品がありません',installed:'インストール済み',missing:'未インストール',sort:'並び順',story:'推奨ストーリー順',release:'発売順',
  nameSort:'作品名',recent:'最近のプレイ順',custom:'カスタム順',noStory:'信頼できるストーリー順は未登録です。カスタム順で表示します。管理画面で入力できます',noRelease:'発売日が不明な作品は、日付がある作品の後に表示します',orderEdit:'順番とバージョン',
  storyNumber:'ストーリー順',releaseNumber:'発売順（手動指定）',releaseDate:'発売日',edition:'バージョンの説明',up:'上へ',down:'下へ',drag:'ドラッグで順番を変更',suggest:'シリーズ分類の候補',accept:'追加',dismiss:'無視',
  failed:'操作できませんでした。再試行してください',saved:'シリーズを更新しました',choose:'作品を選択',noCollections:'シリーズはまだありません。作品を複数選択して作成できます',search:'作品・シリーズを検索',autoHint:'確実な一致のみ自動分類し、曖昧な場合は候補を表示します。手動設定を優先します',
  unknown:'未設定'},
 en:{collection:'Series collection',select:'Select games',cancel:'Cancel selection',selected:n=>`${n} selected`,create:'Create collection',name:'Collection name',
  original:'Original English / Japanese name',developer:'Developer',aliases:'Series aliases (one per line)',count:n=>`${n} games`,back:'Back to library',manage:'Manage collection',
  add:'Add / remove games',cover:'Change cover',dissolve:'Dissolve collection',dissolveTitle:'Dissolve this collection?',dissolveHint:'Only grouping is removed. Games, saves, Hook settings and learning records remain intact',
  confirm:'Dissolve',close:'Close',addTo:'Add to collection',remove:'Remove from collection',empty:'No games in this collection yet',installed:'Installed',missing:'Not installed',
  sort:'Sort',story:'Recommended story order',release:'Release order',nameSort:'Game name',recent:'Recently played',custom:'Custom order',noStory:'No verified story order is available. Custom order is shown; you can enter an order under Manage',
  noRelease:'Games without a verified release date appear after dated games',orderEdit:'Order and edition',storyNumber:'Story order',releaseNumber:'Release order (manual override)',
  releaseDate:'Release date',edition:'Edition notes',up:'Move up',down:'Move down',drag:'Drag games to reorder',suggest:'Suggested series grouping',accept:'Add',
  dismiss:'Dismiss',failed:'Could not complete this action. Please retry',saved:'Collection updated',choose:'Choose games',noCollections:'No collections yet. Select multiple games to create one',
  search:'Search games / series',autoHint:'Only clear identities are grouped automatically. Ambiguous matches are suggestions; manual choices take priority',unknown:'Not set'}
};

Object.assign(seriesMessages.zh,{totalReading:"\u7d2f\u8ba1\u9605\u8bfb",totalWords:"\u5173\u8054\u5355\u8bcd",lastPlayed:"\u6700\u8fd1\u6e38\u73a9",installedCount:"\u5df2\u5b89\u88c5"});
Object.assign(seriesMessages.ja,{totalReading:"\u7d2f\u8a08\u8aad\u66f8",totalWords:"\u95a2\u9023\u5358\u8a9e",lastPlayed:"\u6700\u8fd1\u306e\u30d7\u30ec\u30a4",
 installedCount:"\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\u6e08\u307f"});
Object.assign(seriesMessages.en,{totalReading:"Total reading",totalWords:"Linked words",lastPlayed:"Last played",installedCount:"Installed"});
