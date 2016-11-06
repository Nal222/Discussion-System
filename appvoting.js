var
	app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongodb = require("mongodb")
;

server.listen(80,
	function(){
		console.log("Express server started on address " + JSON.stringify(server.address()));
	}
);

app.get(
	"/",
	function(req, res){
		res.sendfile(__dirname + '/index.html');
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
							collection.save({commentText:""}, {safe:true},
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
			
			console.log("Naveen and Nalini message: error: " + err);
			
			db.createCollection(
				"test",
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
			function (newComment, parentId) {
				doStuffOnCollection(
					function(err, collection){
						collection.find().toArray(
							function(err, results){
								console.log(JSON.stringify(results));
							}
						);
						
						collection.save(newComment, {safe:true},
							function(err, record){
								var newReplyId = record._id;
								console.log("parentId received from client is " + parentId);
								collection.findOne(
									{_id: mongodb.ObjectID.createFromHexString(parentId)},
									function(error, parentCommentObject){
										console.log("error from findOne is: " + error + ", parentCommentObject is " + parentCommentObject);
										if(parentCommentObject.replyIds == undefined)
										{
											parentCommentObject.replyIds = [];
										}
										parentCommentObject.replyIds.push(newReplyId);
										collection.save(parentCommentObject, {safe:true},
											function(err2, records2)
											{
												collection.find().toArray(
													function(err, results){
														socket.emit("updates", results);
													}
												);
											}
										);
									}
								);
							}
						);
					}
				);
			}
		);
	}
);