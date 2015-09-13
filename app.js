var request = require('request'),
cheerio = require('cheerio'),
http = require('http'),
uri = require('url'),
valid = require('validator');

var $ = null,
response = null,
resBack = {},
timeOut = 5000,
onlyHead = false;

function fullURL (url, path) {
	return uri.resolve( url, path );
}

function encode_64 (url) {
	return new Buffer(url).toString('base64');
}

function getBody (url) {
	request.get({
		url: url,
		timeout: timeOut,
		headers: {
			   'User-Agent': 'URLMeta'
		}
	}, function (err, res, body) {

		if(!err && res.statusCode < 400) {

			try {
				$ = cheerio.load( cheerio( 'head', body ).html() );
				var metas = $( 'meta[property], meta[name], meta[itemprop]' );
			} catch (e) {
				respond({ error: true, reason: 'Could not parse HTML of website.', code: 6  });
			}

			if(metas && metas.length > 0) {

				var meta = {};
				metas.each(function() {
					if( $( this ).attr('name') == 'urlmeta'  &&  $( this ).attr('content') )
						respond({ error: true, reason: 'Website does not allow crawling.', code: 3 });
					else if( $( this ).attr('property') == 'og:title' || $( this ).attr('name') == 'twitter:title' )
						meta.title = $( this ).attr('content');
					else if( $( this ).attr('property') == 'og:description' || $( this ).attr('name') == 'twitter:description' || $( this ).attr('itemprop') == 'description' || $( this ).attr('name') == 'description' )
						meta.description = $( this ).attr('content');
					else if( $( this ).attr('property') == 'og:image' || $( this ).attr('name') == 'twitter:image' || $( this ).attr('itemprop') == 'image' )
						meta.image = $( this ).attr('content');
				});

				resBack.title = meta.title;
				resBack.description = meta.description;
				resBack.image = meta.image;

			}

			$('link[rel]').each(function() {
				if( $( this ).attr( 'rel' ) == 'shortcut icon' || $( this ).attr( 'rel' ) == 'icon' )
					resBack.favicon = fullURL( url, $( this ).attr( 'href' ) );
			});

			var feed = $('link[rel=alternate]');
			if( feed.length > 0 ) {
				resBack.feed = {};
				resBack.feed.title = feed[0].attribs.title;
				resBack.feed.type = feed[0].attribs.type;
				resBack.feed.link = fullURL( url, feed[0].attribs.href );
			}

			if(!resBack.title) {
				resBack.title = $('title').text();
			}

			respond();

		} else if (err) {
			respond({ error: true, reason: 'Could not parse HTML of website.', code: 6 });
		}

	});
}

function getHead (url){

	request.head({
		url: url,
	    strictSSL: false,
		timeout: timeOut,
		headers: {
			   'User-Agent': 'URLMeta'
		}
	}).on('response', function (response) {
	  if (response.statusCode == 200) {

	  	if(response.headers['urlmeta'] && response.headers['urlmeta'] == 'no')
	  		respond({ error: true, reason: 'Website does not allow crawling.', code: 3 });

	  	var cont = response.headers['content-type'];
	  	resBack = {
	  			url: url,
	  			type: cont,
	  			size: response.headers['content-length']
	  		};
	  	if( cont.substr(0, 9) == 'text/html' && !onlyHead ) {
	  		getBody(url);
	  	} else {
	  		respond();
	  	}

	  } else if (response.statusCode >= 400) {
	  	respond({ error: true, reason: 'Could not find what you were looking for.', httpCode: response.statusCode, code: 4 });
	  }

	}).on('error', function(err) {
		respond({ error: true, reason: 'Request time out. Website could not be reached in time.', code: 5 });
	});

}


function respond (r) {
	r = r || resBack;

	var sendBack = {
		result: {}
	};

	if(r.error) {
		sendBack.result.status = 'ERROR';
		sendBack.result.code   = r.code;
		sendBack.result.reason =  r.reason || 'Unknown';

		if( sendBack.result.reason != 'Unknown' )
			sendBack.result.reason += ' Read docs here: https://urlmeta.org/dev-api.html';

		if( r.httpCode )
			sendBack.result.httpCode = r.httpCode;

	} else {
		sendBack.meta = {};
		sendBack.result.status = 'OK';

		// omit ;charset=utf-8
		if(r.type && r.type.substr(0, 9) == 'text/html')
			r.type = 'text/html';

		sendBack.meta = r;
	}

	if(onlyHead)
		sendBack.result.onlyHead = true;

	response.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
	response.end( JSON.stringify( sendBack ) );
}

function startURL (url) {
	if( valid.isURL(url, { protocols: ['http','https'], require_protocol: true } ) ) {
		getHead(url);
	} else if( url == undefined )
		respond( { error: true, reason: "Parameter URL not found.", code: 1 } );
	else
		respond( { error: true, reason: "Provided URL '"+ url +"' is not valid", code: 2 } );
}


function init (req, res) {

	var query = uri.parse(req.url, true).query;

	onlyHead = (query.onlyHead != undefined);
	response = res;

	startURL( query.url );
}

var serv = http.Server();
serv.timeout = timeOut;

http.createServer(function (req, res) {

	init( req, res );

}).listen(process.env.PORT || 9615);