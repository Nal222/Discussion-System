var
	express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongodb = require("mongodb")
;

app.use(express.static(__dirname));

server.listen(80,
	function(){
		console.log("Express server started on address " + JSON.stringify(server.address()));
	}
);

app.get(
	"/",
	function(req, res){
		res.sendfile(__dirname + '/indexmostrecenttoplinear.html');
	}
);

app.get(
	"/getdiscussion",
	function (req, res) {
		console.log("getdiscussion branch called!!!");
		doStuffOnCollection(
			function(err, collection){
				var cursor = collection.find();
				cursor.count(
					function(err, number){
						if(number <= 0){
							collection.save({commentText:"", date:Infinity}, {safe:true},
								function(err, record){
									convertCollectionToArrayAndSendToResponse(collection, res);
								}
							);
						}
						else
						{
							convertCollectionToArrayAndSendToResponse(collection, res);
						}
					}
				);
			}
		);
	}
);
function convertCollectionToArrayAndSendToResponse(collection, res){
	collection.find().toArray(
		function(err, results){
			res.json(results);
		}
	);
}

function doStuffOnCollection(theFunction){
	mongoserver = new mongodb.Server("127.0.0.1", mongodb.Connection.DEFAULT_PORT, {poolSize:10});
					
	var CustomPKFactory = {
		counter:0,
		createPk:
			function() {
				this.counter += 1;
				return this.counter;
			}
	}

	//db_connector = new mongodb.Db("db", mongoserver, {pk: CustomPKFactory});
	db_connector = new mongodb.Db("db", mongoserver);
	
	db_connector.open(
		function(err, db){
			
			console.log("Nalini message: error: " + err);
			
			db.createCollection(
				"mostrecentattop",
				theFunction
			);
		}
	);
}

io.sockets.on(
	'connection',
	function (socket) {
		socket.on(
			'newCommentChannel',
			function (newComment) {
				doStuffOnCollection(
					function(err, collection){
						collection.save(newComment, {safe:true},
							function(err, record){
								io.sockets.emit("updateChannel", record);
							}
						);
					}
				);
			}
		);
	}
);