
var test_leitner = function() {
	var le = new leitner();
	var i;
	for(i=0;i<10;i++)
		le.addCard(i);
	var answer_line='';
	for(i=0;i<100;i++)
	{
		/*if (!le.canDraw())
		{
			le.nextSession();
			console.log('#', le.sessionCounter, 'answer: ', answer_line, ' next:', le.session);
			answer_line='';
			if (!le.canDraw())
			{
				console.log('next session empty');
				return;
			}
		}*/
		var prev_session = le.sessionCounter;
		var card_id = le.draw();
		if (card_id===undefined)
		{
			throw 'test failed';
		}
		if (prev_session!=le.sessionCounter)
		{
			console.log('#', le.sessionCounter, 'answer: ', answer_line, ' next:', le.session);
			answer_line='';
		}
		var succ = Math.random()*card_id<5;
		//succ=true;
		answer_line+=' '+card_id.toString()+'->'+succ.toString();
		if (succ) answer_line+=le.deck[card_id][1];
		le.updateCard(card_id, succ);
	}
}

var test_leitner_hand = function() {
	var le = new leitner();
	var i;
	for(i=0;i<10;i++)
		le.addCard(i);
	var answer_line='';
	for(i=0;i<100;i++)
	{
		var hand=[];
		for(;hand.length<5;)
		{
			var card_id = le.draw();
			if (card_id===undefined)
			{
				throw 'draw failed';
				break;
			}
			hand.push(card_id);
		}
		answer_line='';
		for(const card_id of hand)
		{
			var r=Math.random();
			var succ = (r*card_id)<5;
			//succ=true;
			answer_line+=' '+card_id.toString()+'->'+succ.toString();
			if (succ) answer_line+=le.deck[card_id][1];
			le.updateCard(card_id, succ);
		}
		console.log('#', le.sessionCounter, 'answer: ', answer_line, ' remaining:', le.session);
	}
}

var test_leitner_redraw = function() {
	var le = new leitner();
	var i;
	for(i=0;i<20;i++)
		le.addCard(i);
	var answer_line='';
	for(i=0;i<100;i++)
	{
		var hand=[];
		var retries = 0;
		for(;hand.length<5;)
		{
			var card_id = le.draw();
			if (card_id===undefined)
			{
				throw 'draw failed';
				break;
			}
			for(;;)
			{
				var need_redraw = false;
				for(const h of hand)
				{
					if (card_id%10==h%10)
					{
						need_redraw = true;
					}
				}
				if (!need_redraw) break;
				console.log('redraw', card_id);
				card_id = le.reDraw(card_id);
				if (card_id===undefined)
				{
					throw 'redraw failed';
					break;
				}
			}
			if (card_id===undefined)
			{
				break;
			}
			hand.push(card_id);
		}
		//console.log(hand);
		if (hand.length!=5)
		{
			throw 'test failed';
		}
		answer_line='';
		for(const card_id of hand)
		{
			var r=Math.random();
			var succ = (r*card_id)<5;
			//succ=true;
			answer_line+=' '+card_id.toString()+'->'+succ.toString();
			if (succ) answer_line+=le.deck[card_id][1];
			le.updateCard(card_id, succ);
		}
		console.log('#', le.sessionCounter, 'answer: ', answer_line, ' remaining:', le.session);
	}	
}
