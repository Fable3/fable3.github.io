goog.provide('main');

goog.require('spriter');
goog.require('atlas');
goog.require('RenderCtx2D');
goog.require('RenderWebGL');

var hsk_level = 'hsk1';
var player_name = 'player';
var lang_index = 1;
var hard_mode = false;

// Leitner system

leitner = function() {
	'use strict';
	
	this.deck = {};
	this.session = [];
	this.hand = [];
	this.sessionCounter  = 0;
	this.reDrawCounter = 0;
	this.addCard = function(id, lastSessionCounter = 0, rank = 0) {
		this.deck[id]=[lastSessionCounter, rank];
	}
	this.shuffle = function(array, fromIndex) {
	  var currentIndex = array.length-fromIndex, temporaryValue, randomIndex;
	  while (0 !== currentIndex) {
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;
		temporaryValue = array[currentIndex+fromIndex];
		array[currentIndex+fromIndex] = array[randomIndex+fromIndex];
		array[randomIndex+fromIndex] = temporaryValue;
	  }
	  return array;
	}
	
	this.createSession = function() {
		var min_session = -1;
		var prev_session_size = this.session.length;
		for (const [str_key, value] of Object.entries(this.deck)) {
			var key=parseInt(str_key);
			if (this.session.indexOf(key)!=-1 || this.hand.indexOf(key)!=-1)
			{
				continue;
			}
			if (value[0]+value[1]<this.sessionCounter)
			{
				this.session.push(key);
			} else if (min_session==-1 || value[0]+value[1]<min_session)
			{
				min_session = value[0]+value[1];
			}
		}
		this.shuffle(this.session, prev_session_size);
		return min_session;
	}
	
	this.nextSession = function() {
		this.sessionCounter++;
		var prev_session_length = this.session.length;
		var next_min = this.createSession();
		if (this.session.length==prev_session_length && next_min!=-1)
		{
			this.sessionCounter = next_min+1;
			this.createSession();
		}
	}
	
	this.draw = function() {
		if (this.session.length==0)
		{
			this.nextSession();
		}
		if (this.session.length>0)
		{
			this.reDrawCounter = 0;
			var card_id = this.session.pop();//[this.session.length-1];
			this.hand.push(card_id);
			return card_id;
		}
	}
	
	this.updateCard = function(card_id, succ, adv) {
		var idx = this.hand.indexOf(card_id);
		if (idx!=-1)
		{
			this.hand.splice(idx, 1);
		}
		var card = this.deck[card_id];
		card[0]=this.sessionCounter;
		if (succ)
		{
			if (card[1]>=9 &&
				Object.keys(GameState.deck.deck).indexOf(card_id.toString())+10<Object.keys(GameState.deck.deck).length)
			{
				card[1]=Math.floor(Math.random()*30)+adv*20;
			} else
			{
				card[1]+=adv;
			}
		}
		else
			card[1]=0;
	}
	
	this.reDraw = function(card_id) {
		var idx = this.hand.indexOf(card_id);
		if (idx!=-1)
		{
			this.hand.splice(idx, 1);
		}
		this.session.splice(0, 0, card_id);
		this.reDrawCounter++;
		if (this.reDrawCounter>=this.session.length)
		{
			this.nextSession();
			if (this.reDrawCounter>=this.session.length)
			{
				return;
			}
		}
		var card_id = this.session.pop();
		this.hand.push(card_id);
		return card_id;
	}
	
	this.clearHand = function(shuffle) {
		for(const h of this.hand)
		{
			this.session.splice(0, 0, h);
		}
		this.hand = [];
		if (shuffle)
		{
			this.shuffle(this.session, 0);
		}
	}
}

////

var spritecount = 3;
var enemy_id = [18, -1, -1];
var enemy_anim_key = ['idle', 'idle', 'idle'];
var enemy_spid = 1;
var selected_card_index = -1;
var selected_card_accented = 0;
var selected_answer_index = -1;
var good_answer_index = -1;
var pinyin_revealed = false;
var key_buffer="";
var key_buffer_accented="";
var star_card_count = 0;
var GameState = {
	"deck": new leitner(),
	"hand": [],
	"level": 1,
	"maxLevel":1,
	"playerHP":5,
	"monsterHP":10
	};

var default_hand_size = 5;
var word_db = {};

var get_card_rank = function(card_id) {
	if (card_id in GameState.deck.deck)
	{
		var rank= GameState.deck.deck[card_id][1];
		if (rank>9) rank=9;
		return rank;
	}
	return 0;
}
var get_card_damage = function(card_id) {
	var base_dmg = Math.floor((card_id-1)/10)+2;
	var dmg = base_dmg;
	if (selected_card_index!=-1)
	{
		if (GameState.hand[selected_card_index].id==card_id)
		{
			dmg*=[2,3,1,1,2][selected_card_accented];
		}
	}
	return dmg;
}
var get_card_desc = function(card_id) {
	return {txt:get_card_damage(card_id).toString() + " dmg"};
};

var update_star_card_count = function() {
	star_card_count = 0;
	for (const [str_key, value] of Object.entries(GameState.deck.deck)) {
		if (value[1]>=9) star_card_count++;
	}
}

const audio_play_tone = new Audio();

const background_layers = [new Image(), new Image(), new Image(), new Image(), new Image()];
const snow_layer = new Image();
var bg_offset = 0;
var inactive_enemy_bg_offset = 0;
var enemy_walk_in_offset = 0;

switch_enemy_spid = function () {
	enemy_spid=3-enemy_spid;
	inactive_enemy_bg_offset = bg_offset;
}

set_enemy = function(spid, id) {
	if (spid==1) spid = enemy_spid;
	enemy_id[spid] = id;
}

set_anim = function(spid, key) {
	if (spid==1) spid = enemy_spid;
	enemy_anim_key[spid] = key;
}

var current_backgroud_index = 1;

set_background = function(bg_index) {
	if (current_backgroud_index==bg_index) return;
	current_backgroud_index = bg_index;
	var bg_names=['forest', 'night', 'fairy', 'desert', 'winter'];
	for(i=0;i<5;i++)
		background_layers[i].src = 'background/'+bg_names[bg_index%bg_names.length]+'/'+(i+1).toString()+'.png';
	if (bg_index==4)
		snow_layer.src = 'background/'+bg_names[bg_index%bg_names.length]+'/Snow.png';
	else
		snow_layer.src = '';
}


enemy_id_from_level = function(id) {
	const boss_at_level = 10;
	const enemy_models = 5;
	const enemy_variants = 3;
	var m10 = Math.floor(id/boss_at_level);
	if (id==m10*boss_at_level+boss_at_level-1)
	{
		return (m10%enemy_variants)+(enemy_models*enemy_variants);
	}
	id=(id-m10)%(enemy_models*enemy_variants);
	var m5 = Math.floor(id/enemy_models);
	id=id%enemy_models;
	id=(id*(m5+1))%enemy_models;
	return id*3+m5;
}

test_object_pass = function (example) {
	console.log( 'example');
	console.log( JSON.stringify(example, null, 2));
	
    var o = example.question
    console.log(o.chars)
    console.log(o.pinyin)
    console.log(o.english)
    console.log(o.unAccented)
    console.log(example.options[2].chars)
}

var accent_translate=[
{"u":"a", "v":"āáǎà"},
{"u":"e", "v":"ēéěè"},
{"u":"i", "v":"īíǐì"},
{"u":"o", "v":"ōóǒò"},
{"u":"u", "v":"ūúǔù"},
{"u":"v", "v":"ǖǘǚǜ"}];

var append_accent = function (str, acc) {
	if (str.length==0) return str;
	if (acc<1 || acc>4) return str;
	var idx = str.length-1;
	if (str.length>1 && str[idx-1]=='e' && str[idx]=='r')
	{
		idx--;
	} else
	{
		if (str.length>1 && str[idx]=='n')
		{
			idx--;
		}
		else if (str.length>2 && str[idx-1]=='n' && str[idx]=='g')
		{
			idx-=2;
		}
		if (idx>1 && str[idx-1]=='i' && str[idx]=='u')
		{
			// iu or ui -> mark on terminal
			// ui is handled by priority order
		} else
		{
			// can skip v and ü, it's last in order (nüè works)
			const l = "aoeiu";
			var best_p = 10;
			for(var i=idx;i>=0;i--)
			{
				var p = l.indexOf(str[i]);
				if (p==-1) break;
				if (p<best_p)
				{
					best_p=p;
					idx=i;
				}
			}
		}
	}
	var c = str[idx];
	if (c=='ü') c='v';
	var i;
	for(i=0;i<accent_translate.length;i++)
	{
		if (c==accent_translate[i].u)
		{
			str=str.substring(0,idx) + accent_translate[i].v[acc-1] + str.substring(idx+1);
		}
	}
	return str;
}

var get_accent_num = function(str) {
	var idx;
	for(idx=0;idx<str.length;idx++)
	{
		var c = str[idx];
		if (c=='ü') c='v';
		var i;
		for(i=0;i<accent_translate.length;i++)
		{
			var r;
			for(r=0;r<4;r++) if (c==accent_translate[i].v[r])
			{
				return [str.substring(0,idx) + accent_translate[i].u + str.substring(idx+1), r];
			}
		}
	}
	return [str, 4];
}

var card_pos=[];

get_card_pos = function(id, x, y, rot) {
	var i;
	for(i=0;i<card_pos.length;i++)
	{
		if (card_pos[i].id==id) return card_pos[i];
	}
	var cp={"id":id, "x":x, "y":y, "t":0, "rot":rot, "target_x":0, "target_y":0, "target_rot":0};
	card_pos.push(cp);
	return cp;
}

remove_card_pos = function(id) {
	var idx = card_pos.findIndex(cp=>cp.id==id);
	if (idx!=-1)
	{
		card_pos.splice(idx, 1);
	}
}

anim_card_pos = function(cp, dt, rot, x, y, speed)
{
	if (cp.target_rot!=rot || cp.target_x!=x || cp.target_y!=y)
	{
		cp.target_rot = rot;
		cp.target_x = x;
		cp.target_y = y;
		cp.t = speed;
	}
	if (cp.t>dt)
	{
		var rot_diff = (cp.target_rot - cp.rot+Math.PI*3)%(Math.PI*2)-Math.PI;
		cp.rot+=rot_diff*dt/cp.t;
		cp.x+=(cp.target_x-cp.x)*dt/cp.t;
		cp.y+=(cp.target_y-cp.y)*dt/cp.t;
		cp.t-=dt;
	} else
	{
		cp.x = cp.target_x;
		cp.y = cp.target_y;
		cp.rot=cp.target_rot;
		cp.t = 0;
	}
}


select_card = function(id, has_accent = 0) { // 0: not yet, 1: good, 2: mismatched accent, 3: clicked, no accent, 4: typed without accent, can't match
	selected_card_index = id;
	selected_card_accented = has_accent;
	selected_answer_index = -1;
	good_answer_index = -1;
	if (id==-1)
	{
		pinyin_revealed = false;
		key_buffer='';
		key_buffer_accented='';
		var i;
		for(i=0;i<card_pos.length;)
		{
			if (card_pos[i].id>=10000)
			{
				card_pos.splice(i, 1);
			} else
			{
				i++;
			}
		}
	}
}

var audio_queue = [];

var play_next_audio = function() {
	if (audio_queue.length==0) return;
	audio_play_tone.type = "audio/mpeg";
	audio_play_tone.src = audio_queue[0];
	audio_queue.splice(0, 1);
	audio_play_tone.pause();
	audio_play_tone.load();
	audio_play_tone.play();
}

audio_play_pinyin = function(str) {
	const words = pinyin_split(str);
	audio_play_tone.addEventListener("ended", play_next_audio);
	var idx = 0;
	for(idx=0;idx<words.length;idx++)
	{
		var acc = get_accent_num(words[idx]);
		if (acc[1]==4) acc[1]=3;
		var str = acc[0];
		str = str.replace('v', 'u%CC%88');
		audio_queue.push("http://resources.allsetlearning.com/pronwiki/resources/pinyin-audio/" + str + (acc[1]+1).toString() + ".mp3");
	}
	play_next_audio();
}

reveal_pinyin = function()
{
	if (selected_card_index==-1) return;
	pinyin_revealed = true;
	var ch_id = GameState.hand[selected_card_index].id;
	audio_play_pinyin(word_db[ch_id].pinyin);
}

select_answer = function(id) {
	if (selected_card_index!=-1 && id>=0 && id<GameState.hand[selected_card_index].options.length && selected_answer_index==-1)
	{
		var ch_id = GameState.hand[selected_card_index].id;
		var eng_id = GameState.hand[selected_card_index].options[id];
		var succ = ch_id == eng_id;
		//console.log('selected answer: ', word_db[eng_id].english, succ);
		if (!pinyin_revealed)
		{
			reveal_pinyin();
		}
		if (succ)
		{
			end_answer(true);
		} else
		{
			selected_answer_index = id;
			good_answer_index = GameState.hand[selected_card_index].options.indexOf(ch_id);
		}
	}
}
update_enemy = function() {
	GameState.monsterHP = 10+GameState.level*3;
	if (GameState.level%10==9)
	{
		GameState.monsterHP *= 2;
	}
	set_enemy(1, enemy_id_from_level(GameState.level));
	set_anim(1, 'idle');
	set_background(Math.floor(GameState.level/10));
}

end_answer = function(succ) {
	if (selected_card_index!=-1)
	{
		var ch_id = GameState.hand[selected_card_index].id;
		var draw_cards = false;
		if (succ)
		{
			var dmg = get_card_damage(ch_id);
			GameState.monsterHP -= dmg;
			if (GameState.monsterHP<=0)
			{
				GameState.monsterHP = 0;
				set_anim(1, 'hurt+die');
				switch_enemy_spid();
				set_enemy(1, -1);
				set_anim(0, 'attack+jump+run');
			} else
			{
				set_anim(0, 'attack');
				set_anim(1, 'hurt');
			}
		} else
		{
			GameState.playerHP -= 1;
			if (GameState.playerHP<=0)
			{
				GameState.playerHP = 0;
				set_anim(0, 'hurt+die');
			} else
			{
				set_anim(0, 'hurt');
			}
			draw_cards = true;
			set_anim(1, 'attack');
		}
		GameState.deck.updateCard(ch_id, succ, [2,3,1,1,2][selected_card_accented]);
		GameState.hand.splice(selected_card_index, 1);
		update_star_card_count();
		select_card(-1);
		remove_card_pos(ch_id);
		if (GameState.monsterHP==0)
		{
			GameState.level++;
			if (GameState.level>GameState.maxLevel)
			{
				GameState.maxLevel=GameState.level;
				add_random_card_to_deck();
				add_random_card_to_deck();
			}
			if (hard_mode)
			{
				if (GameState.playerHP < 5) GameState.playerHP++;
			} else
			{
				GameState.playerHP = 5;
			}
			update_enemy();
			set_anim(1, 'walk');
			enemy_walk_in_offset = 1000;
			deal_cards(default_hand_size-GameState.hand.length);
		} else
		{
			if (GameState.hand.length == 0 && !draw_cards)
			{
				//var dmg = GameState.level;
				GameState.playerHP -= 1;
				if (GameState.playerHP<0)
				{
					GameState.playerHP = 0;
					set_anim(0, 'attack+hurt+die');
				} else
				{
					set_anim(0, 'attack+hurt');
				}
				draw_cards = true;
				set_anim(1, 'hurt+attack');
			}
		}
		if (draw_cards && GameState.playerHP>0)
		{
			deal_cards(default_hand_size-GameState.hand.length);
		}
		save_cookie();
	}
}

var arrow_state=[0,0,0,0];
var arrow_release_time=[0,0,0,0];
var selected_direction = -1;
var multi_key_release_time = 200;

var update_selected_direction = function() {
	var t = window.performance.now();
	var m = 0;
	var i;
	for(i=0;i<4;i++) m+= (arrow_state[i] || arrow_release_time[i]+multi_key_release_time>t)*2**i;
	var m_to_dir = [
		-1, 0, 1, -1,
		2, 4, 5, -1,
		3, 6, 7, -1,
		-1, -1, -1, -1];
	selected_direction = m_to_dir[m];
}

var get_arrow_id = function(k) {
	if (k=='ArrowLeft') return 0;
	if (k=='ArrowRight') return 1;
	if (k=='ArrowUp') return 2;
	if (k=='ArrowDown') return 3;
	return -1;
}

var clear_arrow_state = function() {
	arrow_state=[0,0,0,0];
	arrow_release_time=[0,0,0,0];
}

var key_released = function(k) {
	var a = get_arrow_id(k);
	if (a!=-1)
	{
		var t = window.performance.now();
		var m = 0;
		var i;
		for(i=0;i<4;i++) m+= (arrow_state[i]);// || arrow_release_time[i]+multi_key_release_time>t);
		update_selected_direction();
		arrow_state[a] = 0;
		if (m<2)
		{
			// release last key
			arrow_release_time=[0,0,0,0];
			select_answer(selected_direction);
		} else
		{
			arrow_release_time[a] = t;
		}
		update_selected_direction();
	}
}

var key_pressed = function(k) {
	var a = get_arrow_id(k);
	if (a!=-1)
	{
		var opposite_id=[1,0,3,2];
		if (arrow_state[opposite_id[a]])
		{
			clear_arrow_state();
		} else
		{
			arrow_release_time[opposite_id[a]] = 0;
			arrow_state[a] = 1;
		}
		update_selected_direction();
		return;
	}
	if (k==="Backspace")
	{
		if (key_buffer.length>0)
		{
			key_buffer = key_buffer.substring(0, key_buffer.length-1);
			key_buffer_accented = key_buffer_accented.substring(0, key_buffer_accented.length-1);
		}
	}
	if (selected_card_index!=-1 && (k==="Enter" || k===" "))
	{
		if (selected_answer_index!=-1)
		{
			end_answer(false);
		} else if (selected_card_accented==0)
		{
			select_card(selected_card_index, 4);
			reveal_pinyin();
		}
		return;
	}
	if (k.length==1)
	{
		var c=k[0];
		if (selected_card_index!=-1)
		{
			if (selected_card_accented==0 && c>='1' && c<='4')
			{
				key_buffer_accented = append_accent(key_buffer_accented, parseInt(c));
				if (key_buffer_accented!=key_buffer)
				{
					if (word_db[GameState.hand[selected_card_index].id].pinyin===key_buffer_accented)
					{
						select_card(selected_card_index, 1);
					} else
					{
						select_card(selected_card_index, 2);
					}
					reveal_pinyin();
				}
			}
			return;
		}
		
		if (selected_card_index==-1 && key_buffer.length==0 && c>='1' && c<='9')
		{
			var idx = parseInt(c)-1;
			if (idx<GameState.hand.length)
			{
				select_card(idx, 3);
				reveal_pinyin();
			}
			return;
		}
		if (c>='1' && c<='4')
		{
			key_buffer_accented = append_accent(key_buffer_accented, parseInt(c));
		} else
		if ((c>='a' && c<='z') || (c>='A' && c<='Z') || c=='ü' || c=='Ü')
		{
			c=c.toLowerCase();
			if (c=='v') c='ü';
			key_buffer = key_buffer + c;
			key_buffer_accented = key_buffer_accented + c;
		}
		if (selected_card_index==-1)
		{
			var i;
			for(i=0;i<GameState.hand.length;i++)
			{
				if (word_db[GameState.hand[i].id].pinyin===key_buffer_accented)
				{
					select_card(i, 1);
					reveal_pinyin();
					break;
				} else if (word_db[GameState.hand[i].id].unAccented===key_buffer)
				{
					var any_match = 0;
					for(var r=1;r<=4;r++)
					{
						if (word_db[GameState.hand[i].id].pinyin === append_accent(key_buffer_accented, r))
						{
							any_match = 1;
						}
					}
					
					if (any_match)
					{
						select_card(i, 0);
					} else
					{
						if (key_buffer_accented==key_buffer)
						{
							select_card(i, 4);
						} else
						{
							select_card(i, 2);
						}
						reveal_pinyin();
					}				
					break;
				}
			}
		}
	}
	//console.log(key_buffer, key_buffer_accented);
}

function get_english_option(card_id) {
	var total_weight = 0;
	var opt = 0;
	for (const [str_key, value] of Object.entries(word_db)) {
		var key=parseInt(str_key);
		if (key!=card_id)
		{
			var weight = Math.exp(-Math.abs(key-card_id)/10);
			total_weight+=weight;
			if (Math.random()*total_weight<weight)
			{
				opt = key;
			}
		}
	}
	return opt;
}

function getCookie(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = decodeURIComponent(ca[i]);
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function start_game()
{
	'use strict';
	var json = getCookie(player_name+'_'+hsk_level);
	if (json=="")
	{
		var count=0;
		for (const [str_key, value] of Object.entries(word_db)) {
			var key=parseInt(str_key);
			GameState.deck.addCard(key);
			if (++count>=10) break;
		}
	} else
	{
		var st = JSON.parse(json);
		GameState.deck.deck = st.deck.deck;
		GameState.deck.hand = st.deck.hand;
		GameState.deck.session = st.deck.session;
		GameState.deck.sessionCounter  = st.deck.sessionCounter;
		GameState.deck.reDrawCounter = st.deck.reDrawCounter;
		GameState.maxLevel = st.maxLevel;
		GameState.level = st.maxLevel-3;
		if (GameState.level<1) GameState.level = 1;
		if (Math.floor(GameState.maxLevel/10)!=Math.floor(GameState.level/10)) GameState.level = Math.floor(GameState.maxLevel/10)*10;
		GameState.deck.clearHand(true);		
		GameState.hand = [];
		GameState.playerHP = 5;
		update_enemy();
	}
	update_star_card_count();
	deal_cards(default_hand_size);
}

function get_all_saved_games()
{
  var res = [];
  var ca = document.cookie.split(';');
  var h = ['hsk1', 'hsk2', 'hsk3'];
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
	var idx=c.indexOf('=');
	if (idx<5) continue;
	var c2 = c.substr(idx-5, 5);
	var h1 = h.find(e=>c2=='_'+e);
	if (!(h1===undefined))
	{
		res.push([decodeURIComponent(c.substr(0, idx-5)), h1]);
	}
  }
  return res;
}

function save_cookie()
{
	var e = 'Tue, 19 Jan 2038 03:14:07 UTC';
	var key = encodeURIComponent(player_name)+'_'+hsk_level;
	document.cookie = key + '='+ JSON.stringify(GameState) +';expires=' + e;
}

function add_random_card_to_deck()
{
	'use strict';
	var first_free = -1;
	var total_weight = 0;
	var sel = -1;
	for (const [str_key, value] of Object.entries(word_db)) {
		var key=parseInt(str_key);
		if (key in GameState.deck.deck)
			continue;
		if (first_free==-1)
			first_free = key;
		var weight = Math.exp((first_free-5-key)/10);
		total_weight+=weight;
		if (Math.random()*total_weight<weight)
		{
			sel = key;
		}
	}
	if (sel!=-1)
	{
		GameState.deck.addCard(sel);
	}
}

function deal_cards(count)
{
	'use strict';
	var prev_hand_length = GameState.hand.length;
	for(var i=0;i<count;i++)
	{
		var card_id = GameState.deck.draw();
		if (card_id===undefined) break;
		GameState.hand.push({"id":card_id, "options":""});
	}
	var options_count = 4;
	if (GameState.level%10==9) options_count=8;
	for(i=0;i<prev_hand_length;i++)
	{
		if (GameState.hand[i].options.length!=options_count)
		{
			prev_hand_length=i;
		}
	}
	
	for (i=prev_hand_length;i<GameState.hand.length;i++)
	{
		var card_id = GameState.hand[i].id;
		var options = [];
		for(;options.length<options_count-1;)
		{
			var opt =  get_english_option(card_id);
			/*if (Math.random()<0.3)
			{
				opt = GameState.hand[...]
			}*/
			if (opt == card_id || options.indexOf(opt)!=-1) continue;
			options.push(opt);
		}
		options.splice(Math.floor(Math.random()*(options.length+1)), 0, card_id);
		GameState.hand[i].options = options;
	}
}

first_anim_key = function(str) {
  if (str.indexOf('+')!=-1)
  {
	  return str.substr(0, str.indexOf('+'));
  }
  return str;
}

main.start = function (div) {
  'use strict';
  loadText("words.txt", function(err, text) {
	  if (err)
	  {
		  return;
	  }
	  const lines=text.replace(/\r/gm, '').split('\n');
	  for(const line of lines)
	  {
		  if (line.length>3)
		  {
			  const col = line.split(';');
			  if (col.length<6)
			  {
				  console.log('invalid line:', line);
				  continue;
			  }
			  if (col[0]!=hsk_level) continue;
			  if (col[4+lang_index]=="")
			  {
				  console.log('empty str:', line);
			  }
			  const unAccented = col[3].normalize('NFD').replace(/\u0304|\u0301|\u030c|\u0300| /g, '').
				normalize('NFC').replace(/(\w|ü)[1-5]/gi, '$1').toLowerCase();
			  
			  word_db[parseInt(col[1])]={"chars": col[2],
					"pinyinOrig": col[3],
					"pinyin": col[3].replaceAll(' ', ''),
					"unAccented": unAccented,
					"english": col[4+lang_index]
			  };
		  }
	  }
	  start_game();
  });
  
	
  document.addEventListener('keydown', event => {
	const key = event.key;
	if (!event.repeat)
	{
		key_pressed(key);
	}
  });
  document.addEventListener('keyup', event => {
	const key = event.key;
	key_released(key);
  });

  var div_element = document.getElementById(div);
  var canvas = [document.createElement('canvas'), document.createElement('canvas'), document.createElement('canvas')];
  var ctx = [null, null, null];
  for(var spid=0;spid<spritecount;spid++)
  {
	  canvas[spid].width = div_element.offsetWidth;
	  canvas[spid].height = div_element.offsetHeight;
	  canvas[spid].style.position = 'absolute';
	  canvas[spid].style.width = canvas.width + 'px';
	  canvas[spid].style.height = canvas.height + 'px';
	  canvas[spid].style.zIndex = -1; // behind controls
	  div_element.appendChild(canvas[spid]);

      ctx[spid] = canvas[spid].getContext('2d');
  }

  window.addEventListener('resize', function() {
	for(var spid=0;spid<spritecount;spid++)
	{		
		canvas[spid].width = div_element.offsetWidth;
		canvas[spid].height = div_element.offsetHeight;
		canvas[spid].style.width = canvas.width + 'px';
		canvas[spid].style.height = canvas.height + 'px';
	}
  });

  var render_ctx2d = [new RenderCtx2D(ctx[0]), new RenderCtx2D(ctx[1]), new RenderCtx2D(ctx[2])];

  var canvas_gl = [document.createElement('canvas'), document.createElement('canvas'), document.createElement('canvas')];
  var gl = [null, null, null];
  for(var spid=spritecount-1;spid>=0;spid--)
  {
	  canvas_gl[spid].width = div_element.offsetWidth;
	  canvas_gl[spid].height = div_element.offsetHeight;
	  canvas_gl[spid].style.position = 'absolute';
	  canvas_gl[spid].style.width = canvas_gl.width + 'px';
	  canvas_gl[spid].style.height = canvas_gl.height + 'px';
	  canvas_gl[spid].style.zIndex = -2; // behind 2D context canvas

	div_element.appendChild(canvas_gl[spid]);

	gl[spid] = canvas_gl[spid].getContext('webgl') || canvas_gl[spid].getContext('experimental-webgl');
  }

  window.addEventListener('resize', function() {
	  for(var spid=0;spid<spritecount;spid++)
	  {
		canvas_gl[spid].width = div_element.offsetWidth;
		canvas_gl[spid].height = div_element.offsetHeight;
		canvas_gl[spid].style.width = canvas_gl.width + 'px';
		canvas_gl[spid].style.height = canvas_gl.height + 'px';
	  }
  });

  var render_webgl = [new RenderWebGL(gl[0]), new RenderWebGL(gl[1]), new RenderWebGL(gl[2])];
  
  var canvas_bg = document.createElement('canvas');
  canvas_bg.width = div_element.offsetWidth;
  canvas_bg.height = div_element.offsetHeight;
  canvas_bg.style.position = 'absolute';
  canvas_bg.style.width = canvas_bg.width + 'px';
  canvas_bg.style.height = canvas_bg.height + 'px';
  canvas_bg.style.zIndex = -3; // behind gl

  div_element.appendChild(canvas_bg);

  var ctx_bg = canvas_bg.getContext('2d');
  
  
  /*var redraw_ground = function() {
	  ctx_ground.clearRect(0, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
	  var x = bg_offset%ctx_ground.canvas.width;
	  ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, -x, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
	  ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, ctx_ground.canvas.width-x, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
  }*/
  
  //img_bg.onload = () => { redraw_bg(); };
  
  
  var canvas_ground = document.createElement('canvas');
  canvas_ground.width = div_element.offsetWidth;
  canvas_ground.height = div_element.offsetHeight;
  canvas_ground.style.position = 'absolute';
  canvas_ground.style.width = canvas_ground.width + 'px';
  canvas_ground.style.height = canvas_ground.height + 'px';
  canvas_ground.style.zIndex = -1; // above
  div_element.appendChild(canvas_ground);

  var ctx_ground = canvas_ground.getContext('2d');
  var redraw_bg = function() {
	  ctx_bg.clearRect(0, 0, ctx_bg.canvas.width, ctx_bg.canvas.height);
	  var layer_mul=[0.1, 0.2, 0.5, 1, 1.2];
	  for(i=0;i<4;i++)
	  {
		var img_bg = background_layers[i];
		
		var x = (bg_offset*layer_mul[i])%ctx_bg.canvas.width;
		ctx_bg.drawImage(img_bg, 0, 0, img_bg.width, img_bg.height, -x, 0, ctx_bg.canvas.width, ctx_bg.canvas.height);
		ctx_bg.drawImage(img_bg, 0, 0, img_bg.width, img_bg.height, ctx_bg.canvas.width-x, 0, ctx_bg.canvas.width, ctx_bg.canvas.height);
	  }
	  
	  var img_ground = background_layers[4];
	  ctx_ground.clearRect(0, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
	  var x = (bg_offset*layer_mul[4])%ctx_ground.canvas.width;
	  ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, -x, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
	  ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, ctx_ground.canvas.width-x, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
	  if (snow_layer.complete && snow_layer.width>0)
	  {
		  var t = window.performance.now();
		  var y = ctx_ground.canvas.height-1-(Math.floor(t/20)%ctx_ground.canvas.height);
		  var x = 0;//Math.floor(t/80)%ctx_ground.canvas.width;
		  ctx_ground.drawImage(snow_layer, 0, 0, img_ground.width, img_ground.height, -x, -y, ctx_ground.canvas.width, ctx_ground.canvas.height);
		  ctx_ground.drawImage(snow_layer, 0, 0, img_ground.width, img_ground.height, -x, ctx_ground.canvas.height-y, ctx_ground.canvas.width, ctx_ground.canvas.height);
		  //ctx_ground.drawImage(snow_layer, 0, 0, img_ground.width, img_ground.height, ctx_ground.canvas.width-x, -y, ctx_ground.canvas.width, ctx_ground.canvas.height);
		  //ctx_ground.drawImage(snow_layer, 0, 0, img_ground.width, img_ground.height, ctx_ground.canvas.width-x, ctx_ground.canvas.height-y, ctx_ground.canvas.width, ctx_ground.canvas.height);
	  }
  }
  for(var i=0;i<5;i++)
	background_layers[i].onload = () => { redraw_bg(); };
  
  set_background(0);
  
  var canvas_cards = document.createElement('canvas');
  canvas_cards.width = div_element.offsetWidth;
  canvas_cards.height = div_element.offsetHeight;
  canvas_cards.style.position = 'absolute';
  canvas_cards.style.width = canvas_cards.width + 'px';
  canvas_cards.style.height = canvas_cards.height + 'px';
  canvas_cards.style.zIndex = 0; // above ground
  div_element.appendChild(canvas_cards);

  var ctx_cards = canvas_cards.getContext('2d');
  
  window.addEventListener('resize', function() {
    canvas_bg.width = div_element.offsetWidth;
    canvas_bg.height = div_element.offsetHeight;
    canvas_bg.style.width = canvas_bg.width + 'px';
    canvas_bg.style.height = canvas_bg.height + 'px';
	//ctx_bg.drawImage(img_bg, 0, 0, img_bg.width, img_bg.height, 0, 0, ctx_bg.canvas.width, ctx_bg.canvas.height);
	
	canvas_ground.width = div_element.offsetWidth;
    canvas_ground.height = div_element.offsetHeight;
    canvas_ground.style.width = canvas_ground.width + 'px';
    canvas_ground.style.height = canvas_ground.height + 'px';
	//ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, 0, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
	
	canvas_cards.width = div_element.offsetWidth;
    canvas_cards.height = div_element.offsetHeight;
    canvas_cards.style.width = canvas_cards.width + 'px';
    canvas_cards.style.height = canvas_cards.height + 'px';
	redraw_bg();
  });

  var camera_x = 0;
  var camera_y = 0;
  var camera_zoom = 1;
  //var absolute_x = 490;
  //var absolute_y = 500;
  var enemy_pos_x = [-200, -200, -200];
  var enemy_pos_y = [0.925, 0.925, 0.925];

  var enable_render_webgl = !!gl[0];
  var enable_render_ctx2d = !!ctx[0] && !enable_render_webgl;

  var enable_render_debug_pose = false;

  // sound player (Web Audio Context)
  var player_web = {};
  player_web.ctx = AudioContext && new AudioContext();
  player_web.mute = true;
  player_web.sounds = {};

  var spriter_data = [null, null, null];
  var spriter_pose = [null, null, null];
  var atlas_data = [null, null, null];

  var anim_time = [0, 0, 0];
  var anim_length = [0,0,0];
  var anim_rate = 1;
  var anim_repeat = 1;
  var next_blink_delay = [5,0,0];

  var alpha = 1.0;

  var loadFile = function(file, spid, callback) {
    render_ctx2d[spid].dropData(spriter_data[spid], atlas_data[spid]);
    render_webgl[spid].dropData(spriter_data[spid], atlas_data[spid]);

    spriter_pose[spid] = null;
    atlas_data[spid] = null;

    var file_path = file.path;
    var file_spriter_url = file.spriter_url;
    var file_atlas_url = (file.atlas_url) ? (file_path + file.atlas_url) : ("");

    loadText(file_spriter_url, function(err, text) {
      if (err) {
        callback(spid);
        return;
      }

      var match = file.spriter_url.match(/\.scml$/i);
      if (match) {
        var parser = new DOMParser();
        // replace &quot; with \"
        var xml_text = text.replace(/&quot;/g, "\"");
        var xml = parser.parseFromString(xml_text, 'text/xml');
        var json_text = xml2json(xml, '\t');
        // attributes marked with @, replace "@(.*)": with "\1":
        json_text = json_text.replace(/"@(.*)":/g, "\"$1\":");
        var json = JSON.parse(json_text);
        var spriter_json = json.spriter_data;
        spriter_data[spid] = new spriter.Data().load(spriter_json);
      } else {
        spriter_data[spid] = new spriter.Data().load(JSON.parse(text));
      }

      spriter_pose[spid] = new spriter.Pose(spriter_data[spid]);

      loadText(file_atlas_url, function(err, atlas_text) {
        var images = {};

        var counter = 0;
        var counter_inc = function() {
          counter++;
        }
        var counter_dec = function() {
          if (--counter === 0) {
            render_ctx2d[spid].loadData(spriter_data[spid], atlas_data[spid], images);
            render_webgl[spid].loadData(spriter_data[spid], atlas_data[spid], images);
            callback(spid);
          }
        }

        counter_inc();

        if (!err && atlas_text) {
          atlas_data[spid] = new atlas.Data().importTpsText(atlas_text);

          // load atlas page images
          var dir_path = file_atlas_url.slice(0, file_atlas_url.lastIndexOf('/'));
          atlas_data[spid].pages.forEach(function(page) {
            var image_key = page.name;
            var image_url = dir_path + "/" + image_key;
            counter_inc();
            images[image_key] = loadImage(image_url, (function(page) {
              return function(err, image) {
                if (err) {
                  console.log("error loading:", image && image.src || page.name);
                }
                page.w = page.w || image.width;
                page.h = page.h || image.height;
                counter_dec();
              }
            })(page));
          });
        } else {
          spriter_data[spid].folder_array.forEach(function(folder) {
            folder.file_array.forEach(function(file) {
              switch (file.type) {
                case 'image':
                  var image_key = file.name;
                  counter_inc();
                  images[image_key] = loadImage(file_path + file.name, (function(file) {
                    return function(err, image) {
                      if (err) {
                        console.log("error loading:", image && image.src || file.name);
                      }
                      counter_dec();
                    }
                  })(file));
                  break;
                case 'sound':
                  break;
                default:
                  console.log("TODO: load", file.type, file.name);
                  break;
              }
            });
          });
        }

        // with an atlas, still need to load the sound files
        spriter_data[spid].folder_array.forEach(function(folder) {
          folder.file_array.forEach(function(file) {
            switch (file.type) {
              case 'sound':
                if (player_web.ctx) {
                  counter_inc();
                  loadSound(file_path + file.name, (function(file) {
                    return function(err, buffer) {
                      if (err) {
                        console.log("error loading sound", file.name);
                      }
                      player_web.ctx.decodeAudioData(buffer, function(buffer) {
                          player_web.sounds[file.name] = buffer;
                        },
                        function() {
                          console.log("error decoding sound", file.name);
                        });
                      counter_dec();
                    }
                  })(file));
                } else {
                  console.log("TODO: load", file.type, file.name);
                }
                break;
            }
          });
        });

        counter_dec();
      });
    });
  }

  var files = [];

  var add_file = function(path, spriter_url, scale,shift_y) {
    var file = {};
    file.path = path;
    file.spriter_url = spriter_url;
    file.atlas_url = "";
	file.scale=scale;
	file.shift_y=(shift_y||0)*scale;
    files.push(file);
  }
  add_file("SCML/satyr_1/", "SCML/satyr.scml", 1);
  add_file("SCML/satyr_2/", "SCML/satyr.scml", 1);
  add_file("SCML/satyr_3/", "SCML/satyr.scml", 1);
  add_file("SCML/SmallGolem_1/", "SCML/small_golem.scml", 1);
  add_file("SCML/SmallGolem_2/", "SCML/small_golem.scml", 1);
  add_file("SCML/SmallGolem_3/", "SCML/small_golem.scml", 1);
  add_file("SCML/minotaur_1/", "SCML/minotaur.scml", 1);
  add_file("SCML/minotaur_2/", "SCML/minotaur.scml", 1);
  add_file("SCML/minotaur_3/", "SCML/minotaur.scml", 1);
  add_file("SCML/reaper_1/", "SCML/reaper.scml", 0.6);
  add_file("SCML/reaper_2/", "SCML/reaper.scml", 0.6);
  add_file("SCML/reaper_3/", "SCML/reaper.scml", 0.6);
  add_file("SCML/Golem_1/", "SCML/golem.scml", 0.8);
  add_file("SCML/Golem_2/", "SCML/golem.scml", 0.8);
  add_file("SCML/Golem_3/", "SCML/golem.scml", 0.8);
  
  
  add_file("SCML/1_orc/", "SCML/1_orc/1_ORK.scml", 0.45, 140);
  add_file("SCML/2_orc/", "SCML/2_orc/2_ORK.scml", 0.45, 140);
  add_file("SCML/3_orc/", "SCML/3_orc/3_ORK.scml", 0.45, 140);
  
  add_file("SCML/woman_warrior_1/", "SCML/woman_warrior_1/1.scml", 0.3);
  
  add_file("SCML/1_troll/", "SCML/1_troll/1_troll.scml", 1, 280);
  add_file("SCML/2_troll/", "SCML/2_troll/2_troll.scml", 1, 280);
  add_file("SCML/3_troll/", "SCML/3_troll/3_troll.scml", 1, 280);
  
  
  
  var card_image = new Image();
  card_image.src = "card.png";
  var card_burnt_image = new Image();
  card_burnt_image.src = "card_burnt.png";
  var scroll_image = new Image();
  scroll_image.src = "scroll.png";
  var scroll_selected_image = new Image();
  scroll_selected_image.src = "scroll_selected.png";
  var scroll_wrong_image = new Image();
  scroll_wrong_image.src = "scroll_wrong.png";
  var rank_image = new Image();
  rank_image.src = 'rank.png';
  var heart_image = new Image();
  heart_image.src = 'heart.png';
  
  
  var flame_image = new Image();
  flame_image.src="flame.png";
  var flame_anim_time=0;
  
  var file_index = [18,0,0];
  
  var loading = [false, false, false];

  var file = [files[file_index[0]], files[file_index[1]], files[file_index[2]]];
  var anim_key = ['idle', 'idle', 'idle'];
  var can_blink = [false, true, false];
  
  for(var spid=0;spid<2;spid++)
  {
	  loading[spid] = true;
	  loadFile(file[spid], spid, function(spid) {
		loading[spid] = false;
		var entity_key = spriter_data[spid].getEntityKeys()[0];
		spriter_pose[spid].setEntity(entity_key);
		spriter_pose[spid].setAnim(first_anim_key(anim_key[spid]));
		spriter_pose[spid].setTime(anim_time[spid] = 0);
		anim_length[spid] = spriter_pose[spid].curAnimLength() || 1000;
	  });
  }
  /*spid = 1;
  loading[spid] = true;
  loadFile(file[spid], spid, function(spid) {
    loading[spid] = false;
    var entity_key = spriter_data[spid].getEntityKeys()[0];
    spriter_pose[spid].setEntity(entity_key);
    spriter_pose[spid].setAnim(first_anim_key(anim_key[spid]));
    spriter_pose[spid].setTime(anim_time[spid] = 0);
    anim_length[spid] = spriter_pose[spid].curAnimLength() || 1000;
  });*/

  var prev_time = 0;
  var rot=0;
  
  canvas_cards.addEventListener('click', function(e) {
	  if (!card_image.complete) return;
	  var rect = e.target.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
	  var i;
	  var card_size=canvas_cards.width/10/card_image.width;
	  var scroll_size=canvas_cards.width/6/scroll_image.width;
	  for(i=0;i<GameState.hand.length;i++)
	  {
		  var cp=get_card_pos(GameState.hand[i].id);
		  var dx = x-cp.x;
		  var dy = y-cp.y;
		  var tx = (Math.cos(cp.rot)*dx - Math.sin(cp.rot)*dy)/card_size;
		  var ty = (Math.sin(cp.rot)*dx + Math.cos(cp.rot)*dy)/card_size;
		  if (tx>-card_image.width/2 && tx<card_image.width/2 &&
		      ty>-card_image.height/2 && ty<card_image.height/2)
		  {
			  if (selected_card_index == i)
			  {
				  reveal_pinyin();
			  } else if (selected_card_index==-1)
			  {
				  select_card(i, 3);
				  reveal_pinyin();
			  }
			  return;
		  }
	  }
	  if (selected_card_index!=-1)
	  {
		  const options = GameState.hand[selected_card_index].options;
		  for(i=0;i<options.length;i++)
		  {
			  var cp=get_card_pos(options[i]+10000);
			  var dx = x-cp.x;
			  var dy = y-cp.y;
			  var tx = (Math.cos(cp.rot)*dx - Math.sin(cp.rot)*dy)/scroll_size;
			  var ty = (Math.sin(cp.rot)*dx + Math.cos(cp.rot)*dy)/scroll_size;
			  if (tx>-cp.width/2 && tx<cp.width/2 &&
				  ty>-scroll_image.height/2 && ty<scroll_image.height/2)
			  {
				  if (selected_answer_index!=-1)
				  {
					  if (i==good_answer_index)
					  {
						end_answer(false);
						return;
					  }
				  } else
				  {
					select_answer(i);
					return;
				  }
			  }
		  }
	  }
    }
  );
 

  var loop = function(time) {
    requestAnimationFrame(loop);
	
	update_selected_direction();

    var dt = time - (prev_time || time);
    prev_time = time; // ms

    var entity_key;
	var spid;
	var enemy_walk_add = 0;
	var bg_adjust = 0;
	
	if (anim_key[0]=='run')
	{
		//spriter_pose.x+=(dt * anim_rate)/1.0;
		//enemy_pos_x+=(dt * anim_rate)/10000.0;
		bg_adjust = (dt * anim_rate)/10.0;
		bg_offset+= bg_adjust;
		redraw_bg();
	} else if (anim_key[0]=='walk')
	{
		//enemy_pos_x+=(dt * anim_rate)/30000.0;
		bg_adjust = (dt * anim_rate)/30.0;
		bg_offset+= bg_adjust;
		redraw_bg();
	} else if (snow_layer.complete && snow_layer.width>0)
	{
		redraw_bg();
	}
	if (enemy_walk_in_offset>0)
	{
		if (anim_key[enemy_spid]=='walk')
		{
			enemy_walk_in_offset -= (dt * anim_rate)/10.0;
		}
		enemy_walk_in_offset-=bg_adjust;
		if (enemy_walk_in_offset<=0)
		{
			enemy_walk_in_offset = 0;
			set_anim(1, 'idle');
			if (anim_key[0]=='run') set_anim(0, 'idle');
		}
	}
	for(spid=0;spid<spritecount;spid++)
	{
		if (ctx[spid]) {
		  ctx[spid].setTransform(1, 0, 0, 1, 0, 0);
		  ctx[spid].clearRect(0, 0, ctx[spid].canvas.width, ctx[spid].canvas.height);
		}

		if (gl[spid]) {
		  gl[spid].viewport(0, 0, gl[spid].drawingBufferWidth, gl[spid].drawingBufferHeight);
		  gl[spid].clearColor(0, 0, 0, 0);
		  gl[spid].clear(gl[spid].COLOR_BUFFER_BIT);
		}
		
		if (enemy_id[spid]!=-1 && enemy_id[spid]!=file_index[spid] && !loading[spid])
		{
		  file_index[spid] = enemy_id[spid];
		  file[spid] = files[file_index[spid]];
		  loading[spid] = true;
		  loadFile(file[spid], spid, function(spid) {
			loading[spid] = false;
			var entity_key = spriter_data[spid].getEntityKeys()[0];
			spriter_pose[spid].setEntity(entity_key);
			anim_key[spid] = 'idle';
			can_blink[spid] = spriter_data[spid].getAnimKeys(entity_key).indexOf('idle_blink')!=-1;
			spriter_pose[spid].setAnim(anim_key[spid]);
			spriter_pose[spid].setTime(anim_time[spid] = 0);
			anim_length[spid] = spriter_pose[spid].curAnimLength() || 1000;
		  });
		  continue;
		}	
	
		if (enemy_id[spid]!=-1 && !loading[spid]) {
		  spriter_pose[spid].update(dt * anim_rate);
		  anim_time[spid] += dt * anim_rate;

		  if (anim_time[spid] >= (anim_length[spid] * anim_repeat) && anim_key[spid]!='idle' && anim_key[spid]!='walk' && anim_key[spid]!='run') {
			if (anim_key[spid]=='die')
			{
				//anim_time = anim_length-1;
				//console.log('die end '+anim_length);
			}
			else
			{
				var next_anim_key = 'idle';
				if (anim_key[spid]=='jump_start') next_anim_key = 'jump';
				else if (anim_key[spid].indexOf('+')!=-1)
				{
					next_anim_key = anim_key[spid].substr(anim_key[spid].indexOf('+')+1);
				}
				//console.log('anim ' + anim_key[spid] +' -> '+next_anim_key);
				var entity_key = spriter_data[spid].getEntityKeys()[0];
				anim_key[spid] = next_anim_key;
				
				spriter_pose[spid].setAnim(first_anim_key(anim_key[spid]));
				spriter_pose[spid].setTime(anim_time[spid] = 0);
				anim_length[spid] = spriter_pose[spid].curAnimLength() || 1000;
			}
		  }
		  
		  if (enemy_anim_key[spid]!='' && enemy_anim_key[spid]!=anim_key[spid])
		  {
			var entity_key = spriter_data[spid].getEntityKeys()[0];
			spriter_pose[spid].setEntity(entity_key);
			anim_key[spid] = enemy_anim_key[spid];
			enemy_anim_key[spid]='';
			spriter_pose[spid].setAnim(first_anim_key(anim_key[spid]));
			spriter_pose[spid].setTime(anim_time[spid] = 0);
			anim_length[spid] = spriter_pose[spid].curAnimLength() || 1000;
		  }
		  if (anim_key[spid]=='idle' && can_blink[spid] && anim_time[spid]>=anim_length[spid]*next_blink_delay[spid])
		  {
			var entity_key = spriter_data[spid].getEntityKeys()[0];
			spriter_pose[spid].setEntity(entity_key);
			anim_key[spid] = 'idle_blink';
			spriter_pose[spid].setAnim(anim_key[spid]);
			spriter_pose[spid].setTime(anim_time[spid] = 0);
			anim_length[spid] = spriter_pose[spid].curAnimLength() || 1000;
			next_blink_delay[spid] = Math.floor(Math.random()*5)+3;
		  }
		}


		if (loading[spid] || enemy_id[spid]==-1) {
		  continue;
		}
		
		if (anim_key[spid]!='die' || anim_time[spid]<anim_length[spid])
		{
			spriter_pose[spid].strike();
		}
    //spriter_pose_next.strike();

    /*spriter_pose.sound_array.forEach(function(sound) {
      if (!player_web.mute) {
        if (player_web.ctx) {
          var source = player_web.ctx.createBufferSource();
          source.buffer = player_web.sounds[sound.name];
          var gain = player_web.ctx.createGain();
          gain.gain = sound.volume;
          var stereo_panner = player_web.ctx.createStereoPanner();
          stereo_panner.pan.value = sound.panning;
          source.connect(gain);
          gain.connect(stereo_panner);
          stereo_panner.connect(player_web.ctx.destination);
          source.start(0);
        } else {
          console.log("TODO: play sound", sound.name, sound.volume, sound.panning);
        }
      }
    });*/

    // compute bone world space
		spriter_pose[spid].bone_array.forEach(function(bone) {
		  var parent_bone = spriter_pose[spid].bone_array[bone.parent_index];
		  if (parent_bone) {
			spriter.Space.combine(parent_bone.world_space, bone.local_space, bone.world_space);
		  } else {
			bone.world_space.copy(bone.local_space);
		  }
		});

		// compute object world space
		spriter_pose[spid].object_array.forEach(function(object) {
		  switch (object.type) {
			case 'sprite':
			  var bone = spriter_pose[spid].bone_array[object.parent_index];
			  if (bone) {
				spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
			  } else {
				object.world_space.copy(object.local_space);
			  }
			  var folder = spriter_data[spid].folder_array[object.folder_index];
			  var file = folder && folder.file_array[object.file_index];
			  if (file) {
				var offset_x = (0.5 - object.pivot.x) * file.width;
				var offset_y = (0.5 - object.pivot.y) * file.height;
				spriter.Space.translate(object.world_space, offset_x, offset_y);
			  }
			  break;
			case 'bone':
			  var bone = spriter_pose[spid].bone_array[object.parent_index];
			  if (bone) {
				spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
			  } else {
				object.world_space.copy(object.local_space);
			  }
			  break;
			case 'box':
			  var bone = spriter_pose[spid].bone_array[object.parent_index];
			  if (bone) {
				spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
			  } else {
				object.world_space.copy(object.local_space);
			  }
			  var entity = spriter_pose[spid].curEntity();
			  var box_info = entity.obj_info_map[object.name];
			  if (box_info) {
				var offset_x = (0.5 - object.pivot.x) * box_info.w;
				var offset_y = (0.5 - object.pivot.y) * box_info.h;
				spriter.Space.translate(object.world_space, offset_x, offset_y);
			  }
			  break;
			case 'point':
			  var bone = spriter_pose[spid].bone_array[object.parent_index];
			  if (bone) {
				spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
			  } else {
				object.world_space.copy(object.local_space);
			  }
			  break;
			case 'sound':
			  break;
			case 'entity':
			  var bone = spriter_pose[spid].bone_array[object.parent_index];
			  if (bone) {
				spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
			  } else {
				object.world_space.copy(object.local_space);
			  }
			  break;
			case 'variable':
			  break;
			default:
			  throw new Error(object.type);
		  }
		});
		var enemy_x_offset = 0;
		if (spid==(3-enemy_spid))
		{
			enemy_x_offset = inactive_enemy_bg_offset - bg_offset;
		} else if (spid==enemy_spid)
		{
			enemy_x_offset = enemy_walk_in_offset;
		}

		if (ctx[spid]) {
		  ctx[spid].globalAlpha = alpha;

		  // origin at center, x right, y up
		  //ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
	
		  ctx[spid].translate(ctx[spid].canvas.width/2, ctx[spid].canvas.height*enemy_pos_y[spid]-file[spid].shift_y);
		  if (spid==0)
			ctx[spid].scale(1, -1);
		  else
			ctx[spid].scale(-1, -1);

		  if (enable_render_ctx2d && enable_render_webgl) {
			ctx[spid].translate(-ctx[spid].canvas.width / 4, 0);
		  }

		  ctx[spid].translate(-camera_x+enemy_pos_x[spid]-enemy_x_offset, -camera_y);
		  ctx[spid].scale(camera_zoom*file[spid].scale, camera_zoom*file[spid].scale);
		  ctx[spid].lineWidth = 1 / (camera_zoom*file[spid].scale);

		  if (enable_render_ctx2d) {
			render_ctx2d[spid].drawPose(spriter_pose[spid], atlas_data[spid]);
			//ctx.translate(0, -10);
			//render_ctx2d.drawPose(spriter_pose_next, atlas_data[spid]);
		  }

		  if (enable_render_debug_pose) {
			render_ctx2d[spid].drawDebugPose(spriter_pose[spid], atlas_data[spid]);
			//ctx.translate(0, -10);
			//render_ctx2d.drawDebugPose(spriter_pose_next, atlas_data[spid]);
		  }
		}
		if (gl[spid]) {
		  var gl_color = render_webgl[spid].gl_color;
		  gl_color[3] = alpha;

		  var gl_projection = render_webgl[spid].gl_projection;
		  mat4x4Identity(gl_projection);
		  var mirror = 1;
		  if (spid==0) mirror = -1;
		  mat4x4Ortho(gl_projection, mirror*gl[spid].canvas.width / 2, -mirror*gl[spid].canvas.width / 2, -gl[spid].canvas.height / 2, gl[spid].canvas.height / 2, -1, 1);
		  //mat4x4Ortho(gl_projection, -absolute_x, -absolute_x+gl.canvas.width, -absolute_y, -absolute_y+gl.canvas.height, -1, 1);
		  
		  mat4x4Translate(gl_projection, enemy_pos_x[spid]-enemy_x_offset, (gl[spid].canvas.height / 2-gl[spid].canvas.height*enemy_pos_y[spid]+file[spid].shift_y), 0);

		  if (enable_render_ctx2d && enable_render_webgl) {
			mat4x4Translate(gl_projection, gl[spid].canvas.width / 4, 0, 0);
		  }

		  mat4x4Translate(gl_projection, -camera_x, -camera_y, 0);
		  mat4x4Scale(gl_projection, camera_zoom*file[spid].scale, camera_zoom*file[spid].scale, camera_zoom*file[spid].scale);

		  if (enable_render_webgl) {
			render_webgl[spid].drawPose(spriter_pose[spid], atlas_data[spid]);
			//mat4x4Translate(gl_projection, 0, -10, 0);
			//render_webgl.drawPose(spriter_pose_next, atlas_data[spid]);
		  }
		}
	}
	
  flame_anim_time+=dt;
  if (card_image.complete && card_burnt_image.complete && scroll_image.complete && scroll_selected_image.complete && scroll_wrong_image.complete && rank_image.complete)
  {
	  ctx_cards.clearRect(0, 0, ctx_cards.canvas.width, ctx_cards.canvas.height);
	  var font_size=ctx_cards.canvas.height/20;
	  var rank_d = 100;
	  
	  ctx_cards.font = font_size.toString()+"px Arial Bold";
	  ctx_cards.fillStyle = "black";
	  ctx_cards.textAlign = "left";
	  var line_idx = 1;
	  ctx_cards.lineWidth = font_size/10;
	  ctx_cards.lineJoin="miter";
	  ctx_cards.miterLimit=2;
	  function drawStroked(text, x, y) {
		  ctx_cards.strokeStyle = 'white';
		  ctx_cards.strokeText(text, x, y);
		  ctx_cards.fillStyle = 'black';
		  ctx_cards.fillText(text, x, y);
	  }
	  if (selected_card_index!=-1 && pinyin_revealed)
	  {
	    if (selected_card_accented==2)
		{
			drawStroked('Pinyin input: ' + key_buffer_accented+ ' correct: '+word_db[GameState.hand[selected_card_index].id].pinyin, 20, (line_idx++)*font_size);
		} else
		{
			drawStroked('Correct pinyin: ' + word_db[GameState.hand[selected_card_index].id].pinyin, 20, (line_idx++)*font_size);
		}
	  } else
	  {
		drawStroked('Pinyin input: ' + key_buffer_accented, 20, (line_idx++)*font_size);
	  }
	  var level_txt = 'Level: ' + (GameState.level).toString();
	  var star_pos_y = (line_idx++)*font_size;
	  drawStroked(level_txt, 20, star_pos_y);
	  var star_pos_x = ctx_cards.measureText(level_txt).width+20+20;
	  var star_d = font_size;
	  ctx_cards.drawImage(rank_image, 0, rank_image.height/10*9, rank_image.width, rank_image.height/10, star_pos_x, star_pos_y-font_size*0.8, star_d, star_d);
	  drawStroked(star_card_count.toString()+"/"+(Object.keys(GameState.deck.deck).length).toString(), star_pos_x+font_size*1.2, star_pos_y);
	  let player_hp_txt = 'Player HP: ';
	  drawStroked(player_hp_txt, 20, (line_idx++)*font_size);// + (GameState.playerHP).toString(), 20, (line_idx++)*font_size);
	  if (heart_image.complete)
	  {
		  var heart_x = ctx_cards.measureText(player_hp_txt).width+20;
		  var heart_y = (line_idx-2)*font_size+font_size*0.2;
		  for(i=0;i<GameState.playerHP;i++) ctx_cards.drawImage(heart_image, 0, 0, heart_image.width, heart_image.height, heart_x+i*font_size*1.2, heart_y, font_size, heart_image.height*font_size/heart_image.width);
	  }
	  drawStroked('Monster HP: ' + (GameState.monsterHP).toString(), 20, (line_idx++)*font_size);
	  
	  
	  var card_size=ctx_cards.canvas.width/10/card_image.width;
	  var scroll_size=ctx_cards.canvas.width/6/scroll_image.width;
	  var max_rot = 0.3;
	  var radi = 3200*card_size;

	  for(i=0;i<GameState.hand.length;i++)
	  {
		ctx_cards.save();
		var rot;
		var card_x;
		var card_y;
		if (selected_card_index==i)
		{
			rot = 0;
			card_x = ctx_cards.canvas.width/2;
			card_y = card_size*card_image.height*1.5;
		} else
		{
			var card_count = GameState.hand.length;
			var card_index = i;
			if (selected_card_index!=-1)
			{
				card_count--;
				if (selected_card_index<i) card_index--;
			}
			if (card_count==1) rot = 0;
			else rot = -(2*card_index+1)*max_rot*2/(2*card_count)+max_rot;
			card_x=-radi*Math.sin(rot)+ctx_cards.canvas.width/2;
			card_y=-radi*Math.cos(rot)+radi+ctx_cards.canvas.height/2;
			if (selected_card_index!=-1)
			{
				card_y+=card_size*card_image.height+scroll_size*scroll_image.height;
			}
		}
		var cp = get_card_pos(GameState.hand[i].id, ctx_cards.canvas.width/2, ctx_cards.canvas.height/2, 0);
		anim_card_pos(cp, dt, rot, card_x, card_y, 300);
		ctx_cards.transform(card_size*Math.cos(cp.rot), -card_size*Math.sin(cp.rot), card_size*Math.sin(cp.rot), card_size*Math.cos(cp.rot), cp.x, cp.y);			
		var img=card_image;
		if (i==selected_card_index && selected_card_accented==2) img=card_burnt_image;
		ctx_cards.drawImage(img, -card_image.width/2, -card_image.height/2);
		var rank = get_card_rank(GameState.hand[i].id);
		
		ctx_cards.drawImage(rank_image, 0, rank_image.height/10*rank, rank_image.width, rank_image.height/10, 
			card_image.width/2-rank_d-20, -card_image.height/2+20, rank_d, rank_d);
		if (flame_image.complete && i==selected_card_index && selected_card_accented==1)
		{
			var frame_count = 18;
			var frame_idx = Math.floor(flame_anim_time/100)%frame_count;
			var frame_height = flame_image.height/frame_count;
			var marg_x = 80;
			var marg_y= 105;
			ctx_cards.drawImage(flame_image, 0, frame_idx*frame_height, flame_image.width, frame_height, -card_image.width/2-marg_x, -card_image.height/2-marg_y, card_image.width+marg_x*2, card_image.height+marg_y*2+30);
		}
		//font-family: 'Noto Sans SC', sans-serif;
		//font-family: 'Noto Serif SC', serif;
		//font-family: 'Ma Shan Zheng', cursive;
		//font-family: 'Zhi Mang Xing', cursive;
		font_size = 200;
		var txt = word_db[GameState.hand[i].id].chars;
		if (txt.length>2) font_size = Math.floor(font_size*2/txt.length);
		//var font_type = "Noto Sans SC";
		var font_type = "Noto Serif SC";
		if (rank>=6) font_type = "Zhi Mang Xing";
		else if (rank>=3) font_type = "Ma Shan Zheng";
		ctx_cards.font = font_size.toString() + "px " + font_type;
		ctx_cards.fillStyle = "red";
		ctx_cards.textAlign = "center";
		ctx_cards.fillText(txt, 0, 0);
		var font_size=60;
		ctx_cards.font = font_size.toString()+"px Arial";
		ctx_cards.fillStyle = "black";
		ctx_cards.textAlign = "left";
		ctx_cards.fillText((i+1).toString(), -card_image.width/2+20, -card_image.height/2+10+font_size);
		ctx_cards.textAlign = "center";
		const lines=get_card_desc(GameState.hand[i].id).txt.split('\n');
		var idx;
		for(idx=0;idx<lines.length;idx++)
			ctx_cards.fillText(lines[idx], 0, card_image.height/2-15+(idx-lines.length+0.8)*font_size);
		ctx_cards.restore();
	  }
	  if (selected_card_index!=-1)
	  {
		var cp_sel = get_card_pos(GameState.hand[selected_card_index].id, ctx_cards.canvas.width/2, ctx_cards.canvas.height/2, 0);
		var max_width_save=[];
		for(i=0;i<GameState.hand[selected_card_index].options.length;i++)
		{
			var eng_id = GameState.hand[selected_card_index].options[i];
			ctx_cards.save();
			var rot = 0;
			var card_x = ctx_cards.canvas.width/2;
			var card_y = card_size*card_image.height*1.5;
			var pos_translate = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
			const px = pos_translate[i][0];
			const py = pos_translate[i][1];
			
			ctx_cards.font = "50px Arial";
			//ctx_cards.font = "200px Noto Sans SC";
			ctx_cards.textAlign = "center";
			ctx_cards.fillStyle = "white";
			var lines = word_db[eng_id].english.split('\\n');
			var max_width=0;
			var line_width=[];
			ctx_cards.transform(scroll_size, 0, 0, scroll_size, 0, 0);
			for(var lineidx = 0; lineidx<lines.length;lineidx++)
			{
				var w = ctx_cards.measureText(lines[lineidx]).width;
				if (w>max_width) max_width = w;
				line_width[lineidx]=w;
			}
			ctx_cards.restore();
			ctx_cards.save();
			max_width_save[i]=max_width;
			const scroll_border = scroll_image.width/6;
			
			var x_offset = 0;
			let adj_width = 0;
			if (py==-1 && px!=0)
			{
				adj_width = max_width_save[2];
			} else if (py==1 && px!=0)
			{
				adj_width = max_width_save[3];
			}
			let adj_diff = adj_width+2*scroll_border-scroll_image.width;
			if (adj_diff>0)
			{
				x_offset += adj_diff/2*px;
			}
			let diff = max_width+2*scroll_border-scroll_image.width;
			let render_scroll_width = scroll_image.width;
			if (diff>0)
			{
				render_scroll_width = max_width+2*scroll_border;
				x_offset += diff/2*px;
			}
			
			card_x+=px*(card_size*card_image.width+scroll_size*scroll_image.width/2)+x_offset*scroll_size;
			card_y+=py*(card_size*card_image.height*0.5+scroll_size*scroll_image.height/2);
			var cp = get_card_pos(eng_id+10000, cp_sel.x, cp_sel.y, 0);
			cp.width = render_scroll_width;
			anim_card_pos(cp, dt, rot, card_x, card_y, 300);
			ctx_cards.transform(scroll_size*Math.cos(cp.rot), -scroll_size*Math.sin(cp.rot), scroll_size*Math.sin(cp.rot), scroll_size*Math.cos(cp.rot), cp.x, cp.y);			
			var img=scroll_image;
			var text_color = "blue";
			if (selected_answer_index==-1)
			{
				if (selected_direction==i)
				{
					img = scroll_selected_image;
					text_color = "white";
				}
			} else
			{
				if (good_answer_index == i)
				{
					img = scroll_selected_image;
					text_color = "white";
				} else
				if (selected_answer_index==i)
				{
					img = scroll_wrong_image;
					text_color = "white";
				}
			}
			ctx_cards.font = "50px Arial";
			ctx_cards.textAlign = "center";
			ctx_cards.fillStyle = text_color;
			if (diff>0)
			{
				ctx_cards.drawImage(img, 0, 0,  scroll_border, scroll_image.height, -max_width/2-scroll_border, -scroll_image.height/2, scroll_border, scroll_image.height);
				ctx_cards.drawImage(img, scroll_border, 0, scroll_image.width-2*scroll_border,  scroll_image.height, -max_width/2, -scroll_image.height/2, max_width, scroll_image.height);
				ctx_cards.drawImage(img, scroll_image.width-scroll_border, 0, scroll_border, scroll_image.height, max_width/2, -scroll_image.height/2, scroll_border, scroll_image.height);
			} else
			{
				ctx_cards.drawImage(img, -scroll_image.width/2, -scroll_image.height/2);
			}
			
			for(var lineidx = 0; lineidx<lines.length;lineidx++)
			{
				ctx_cards.fillText(lines[lineidx], 0, (lineidx-(lines.length-1)/2)*60+15);
			}
			
			ctx_cards.restore();
		}
	  }
    }
  }

  requestAnimationFrame(loop);
}

function loadText(url, callback) {
  var req = new XMLHttpRequest();
  if (url) {
    req.open("GET", url, true);
    req.responseType = 'text';
    req.addEventListener('error', function() {
      callback("error", null);
    });
    req.addEventListener('abort', function() {
      callback("abort", null);
    });
    req.addEventListener('load', function() {
        if (req.status === 200) {
          callback(null, req.response);
        } else {
          callback(req.response, null);
        }
      },
      false);
    req.send();
  } else {
    callback("error", null);
  }
  return req;
}

function loadImage(url, callback) {
  var image = new Image();
  image.crossOrigin = "Anonymous";
  image.addEventListener('error', function() {
    callback("error", null);
  });
  image.addEventListener('abort', function() {
    callback("abort", null);
  });
  image.addEventListener('load', function() {
    callback(null, image);
  });
  image.src = url;
  return image;
}

function loadSound(url, callback) {
  var req = new XMLHttpRequest();
  if (url) {
    req.open("GET", url, true);
    req.responseType = 'arraybuffer';
    req.addEventListener('error', function() {
      callback("error", null);
    });
    req.addEventListener('abort', function() {
      callback("abort", null);
    });
    req.addEventListener('load', function() {
        if (req.status === 200) {
          callback(null, req.response);
        } else {
          callback(req.response, null);
        }
      });
    req.send();
  } else {
    callback("error", null);
  }
  return req;
}
