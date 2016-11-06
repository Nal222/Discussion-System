var
	express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongodb = require("mongodb"),
	excelbuilder = require('msexcel-builder'),
	numberOfParticipants = 3
	interval = 5*60*1000,
	numberOfVotesInSession = 5;
;


app.use(express.static(__dirname));

server.listen(80,
	function(){
		console.log("Express server started on address " + JSON.stringify(server.address()));
		//TODO: store viewmode "admin" in mongo
	}
);

app.get(
	"/",
	function(req, res){
		res.sendfile(__dirname + '/index.html');
	}
);

app.get(
	"/getvotinginfo",
	function(req, res){
		console.log("getvotinginfo reached!");
		buildExcelFile(req.query.sessionId, res);
	}
);


app.get(
	"/getdiscussion",
	function (req, res) {
		console.log("getdiscussion branch called!!!");
		doStuffOnCollection(
			"currentSessionId",
			function(err, collection){
				collection.findOne(
					function(err, itemFound){
						console.log("Trying to get discussion for session id: " + JSON.stringify(itemFound));
						getCollectionAsArrayAndSendToResponse("test", {commentText:""}, res, {sessionId:itemFound.currentSessionId});
					}
				);
			}
		);
		
	}
);

//To populate the drop-down list of sessions to choose from
app.get(
	"/getsessions",
	function (req, res) {
		getCollectionAsArrayAndSendToResponse("sessions", {}, res, {});
	}
);

app.get(
	"/getviewmode",
	function (req, res) {
		console.log("getviewmode branch called!!!");
		getCollectionAsArrayAndSendToResponse("viewMode", {viewMode:"admin"}, res, {});
	}
);

app.get(
	"/getcurrenttopicnumber",
	function (req, res) {		
		doStuffOnCollection(
			"currentSessionId",
			function(err, collection){
				collection.findOne(
					function(err, item){
						var currentSessionId = item.currentSessionId;
						console.log("Current session id found as " + currentSessionId);
						doStuffOnCollection(
							"sessions",
							function(err, collection){
								collection.findOne(
									{_id:currentSessionId},
									function(err, item){
										var currentTopicNumber = item.topicNumber;
										console.log("Returning current topic number as " + currentTopicNumber);
										res.json(currentTopicNumber);
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

function getCollectionAsArrayAndSendToResponse(collectionName, defaultValue, res, queryObject){
	doStuffOnCollection(
			collectionName,
			function(err, collection){
				var cursor = collection.find(queryObject);
				cursor.count(
					function(err, number){
						console.log("number of items found is " + number + "!");
						if(number <= 0){
							collection.save(defaultValue, {safe:true},
								function(err, record){
									convertCollectionToArrayAndSendToResponse(collection, res, queryObject);
								}
							);
						}
						else
						{
							convertCollectionToArrayAndSendToResponse(collection, res, queryObject);
						}
					}
				);
			}
		);
}

function convertCollectionToArrayAndSendToResponse(collection, res, queryObject){
	collection.find(queryObject).toArray(
		function(err, results){
			res.json(results);
		}
	);
}

function doStuffOnViewModeCollection(theFunction){
	doStuffOnCollection("viewMode", theFunction);
}

function doStuffOnCollection(collectionName, theFunction){
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
	db_connector = new mongodb.Db("db", mongoserver, {w:1});
	
	db_connector.open(
		function(err, db){
			db.createCollection(
				collectionName,
				theFunction
			);
		}
	);
}

function stringToHex(string){
	return mongodb.ObjectID.createFromHexString(string);
}

function saveCommentAndEmitUpdate(newComment, parentId){
	console.log("Trying to save comment " + JSON.stringify(newComment));
	
	doStuffOnCollection(
		"currentSessionId",
		function(err, collection){
			collection.findOne(
				function(err, itemFound){
					console.log("function entered with collection.findOne");
					console.log("currentSessionid = " + itemFound.currentSessionId);
					console.log("itemfound is " + JSON.stringify(itemFound));
					var currentSessionId = itemFound.currentSessionId;
					doStuffOnCollection(
						"test",
						function(err, collection){
						
							/*
							collection.find().toArray(
								function(err, results){
									console.log(JSON.stringify(results));
								}
							);
							*/
							
							console.log("TEST (comments) collection available OK? err is " + err);
							
							newComment.sessionId = currentSessionId;
							
							collection.save(
								newComment,
								{safe:true},
								function(err, record){
									var newReplyId = record._id;
									console.log("parentId received from client is " + parentId);
									collection.findOne(
										{_id: stringToHex(parentId)},
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
															console.log("Comment: " + record.commentText + " saved OK!!!!");
															io.sockets.emit("updateChannel", results);
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
}

function clearAndSave(collection, itemToSave, callbackAfterSaved){
	collection.remove(
		function(err, numberOfRemovedItems){
			collection.save(
				itemToSave,
				callbackAfterSaved
			);
		}
	);
}

function buildExcelFile(sessionIdString, res){
	var sessionId = stringToHex(sessionIdString);
	doStuffOnCollection(
		"votes",
		function(err, collection){
			collection.find({sessionId:sessionId}).toArray(
				function(err, results){
					var userNamesAlreadyChecked = [];
					console.log("Results (votes) length is " + results.length);
					for(var i = 0; i < results.length; i++){
						var vote = results[i];
						console.log("Username is " + vote.userName + ", poll index is " + vote.pollIndex + ", score is " + vote.score);
						var alreadyInList = false;
						for(var n = 0; n < userNamesAlreadyChecked.length; n++){
							if(userNamesAlreadyChecked[n]==vote.userName){
								alreadyInList = true;
								break;
							}
						}
						if(alreadyInList==true){
							continue;
						}
						userNamesAlreadyChecked.push(vote.userName);
					}
					
					var voteScores = [];
					
					var numberOfUsers = userNamesAlreadyChecked.length;
					
					for(var i = 0; i < numberOfUsers; i++){
						//var indexOfUser = i;
						var theFunction = function(indexOfUser, userName){
							var voteScoresForUser = {};	
							voteScores.push(voteScoresForUser);
							collection.find({sessionId:sessionId, userName:userName}).toArray(
								function(err, results){
									console.log("Got votes for a user in this session, indexOfUser is " + indexOfUser + ", i is " + i + "!");
									for(var i = 0; i < results.length; i++){
										var vote = results[i];
										voteScoresForUser[vote.pollIndex] = vote.score;
										console.log("Setting score for pollIndex " + vote.pollIndex + " and user " + indexOfUser + " to " + vote.score);
									}
									if(indexOfUser >= numberOfUsers - 1){
										console.log("Creating workbook, indexOfUser (should be 1) is " + indexOfUser + ", numberOfUsers is " + numberOfUsers);
										var workbook = excelbuilder.createWorkbook('./', 'votinginfo.xlsx')
										var sheet = workbook.createSheet('sheet', numberOfVotesInSession, numberOfUsers);
										console.log("Creating excel sheet, number of users is " + numberOfUsers);
										for(var currentUserIndex = 0; currentUserIndex < numberOfUsers; currentUserIndex++){												
											for(var currentPollIndex = 0; currentPollIndex < numberOfVotesInSession; currentPollIndex++){
												var score = voteScores[currentUserIndex][currentPollIndex];
												console.log("Calling sheet.set on " + (currentPollIndex + 1) + ", " + (currentUserIndex + 1) + ", cell value: " + score); 	
												if(score != undefined){
													sheet.set(currentPollIndex + 1, currentUserIndex + 1, score);
												}
											}
										}
										workbook.save(
											function(ok){
												res.send();
												if (!ok){
													console.log("There was some error while saving the workbook!");
													workbook.cancel();
												}
												else{
													console.log('congratulations, your workbook created');
												}
											}
										);
									}
								}
							);
						};
						theFunction(i, userNamesAlreadyChecked[i]);
					}
				}
			);
		}
	);
}

io.sockets.on(
	'connection',
	function (socket) {
		socket.on(
			"selectSessionAndGoToDiscussion",
			function(sessionId){
				doStuffOnCollection(
					"currentSessionId",
					function(err, collection){
						clearAndSave(
							collection,
							{currentSessionId:stringToHex(sessionId)},
							function(err, itemSaved){
								console.log("Type of currentSessionId is " + (typeof itemSaved.currentSessionId) + " type of a string is " + (typeof "Hello"));
								doStuffOnCollection(
									"viewMode",
									function(err, collection){
										clearAndSave(
											collection,
											{viewMode:"discussion"},
											function(err, itemSaved){
												io.sockets.emit("viewModeChanged");
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
	
		socket.on(
			'newCommentChannel',
			function (newComment, parentId) {
				saveCommentAndEmitUpdate(newComment, parentId);
			}
		);
		
		socket.on(
			"startNewSessionChannel",
			function(session, alternatives){
				console.log("Enter function after");
				doStuffOnCollection(
					"sessions",
					function(err, collection){
						console.log("function before saving session to Mongo");
						
						session.time = new Date().getTime();
					
						console.log("About to save " + JSON.stringify(session) + " to mongo");
						
						session.nextPollIndex = 0;
						session.numberOfVotesCastForNextPollIndex = 0;
					
						collection.save(
							session,
							function(err, itemSaved){
								var currentSessionIdToSave = itemSaved._id;
								console.log("Saved " + JSON.stringify(itemSaved) + " to mongo");
								doStuffOnCollection(
									"test",
									function(err, collection){
										collection.save(
											{commentText:"", sessionId:currentSessionIdToSave},
											function(err, itemSaved){
												for(var i = 0; i < alternatives.length; i++){
													saveCommentAndEmitUpdate({commentText:alternatives[i], sessionId:currentSessionIdToSave}, itemSaved._id.toHexString());
												}
											}
										);
									}
								);
								
								doStuffOnCollection(
									"currentSessionId",
									function(err, collection){
										clearAndSave(
											collection,
											{currentSessionId:currentSessionIdToSave},
											function(err, itemSaved){
												console.log("Saved (currentSessionId) " + JSON.stringify(itemSaved) + " to mongo");
												doStuffOnCollection(
													"viewMode",
													function(err, collection2){
														clearAndSave(
															collection2,
															{viewMode:"vote"},
															function(err, record){
																io.sockets.emit("viewModeChanged");
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
		
		socket.on(
			"votingChannel",
			function(vote){
				console.log("socket.on is happening function(vote) has been reached");
				doStuffOnCollection(
					"currentSessionId",
					function(err, collection){
						collection.findOne(
							function(err, itemFound){
								var currentSessionId = itemFound.currentSessionId;
								console.log("current session id is" + currentSessionId);
								doStuffOnCollection(
									"sessions",
									function(err, sessionsCollection){
										console.log("function entered err sessionsCollection" + err);
										sessionsCollection.findOne(
											{_id:currentSessionId},
											function(err, itemFound){
												console.log("function entered err itemfound" + err + JSON.stringify(itemFound));
												var currentSession = itemFound;
												console.log("currentSession = " + currentSession);
												doStuffOnCollection(
													"votes",
													function(err, collection){
														vote.pollIndex = currentSession.nextPollIndex;
														vote.sessionId = currentSessionId;
														console.log("pollindex of vote= " + vote.pollIndex);
														console.log("vote before saving = " + vote);
														console.log("vote.sessionId = " + currentSessionId);
														collection.save(
															vote,
															function(err, itemSaved){
																console.log("itemSaved= " + itemSaved);
																currentSession.numberOfVotesCastForNextPollIndex++;
																console.log("currsession.numberof votes=" + currentSession.numberOfVotesCastForNextPollIndex);
																console.log("currentSession just before saving = " + currentSession);
																sessionsCollection.save(
																	currentSession,
																	function(err, itemSaved){
																		console.log("itemSaved.numberOfVotesCastForCurrentSession=" + itemSaved.numberOfVotesCastForNextPollIndex);
																		if(currentSession.numberOfVotesCastForNextPollIndex >= numberOfParticipants){
																			currentSession.numberOfVotesCastForNextPollIndex = 0;
																			currentSession.nextPollIndex++;
																			console.log("nextPollIndex = " + currentSession.nextPollIndex);
																			if(currentSession.nextPollIndex==numberOfVotesInSession){
																				doStuffOnCollection(
																						"viewMode",
																						function(err, collection){
																						//console.log("function entered viewMode= " + viewMode);
																							clearAndSave(
																								collection,
																								{viewMode:"end"},
																								function(err, record){
																									io.sockets.emit("viewModeChanged");
																								}
																							);
																						}
																					);
																				
																			}
																			else{
																				setTimeout(
																					function(){
																						doStuffOnCollection(
																							"viewMode",
																							function(err, collection){
																								clearAndSave(
																									collection,
																									{viewMode:"vote"},
																									function(err, record){
																										io.sockets.emit("viewModeChanged");
																									}
																								);
																							}
																						);
																					},
																					interval
																				);
								
																				console.log("currentSessionnext poll " + currentSession.nextPollIndex);
																				sessionsCollection.save(
																					currentSession,
																					function(err, itemSaved){
																						doStuffOnCollection(
																							"viewMode",
																							function(err, collection){
																							//console.log("function entered viewMode= " + viewMode);
																								clearAndSave(
																									collection,
																									{viewMode:"discussion"},
																									function(err, record){
																										io.sockets.emit("viewModeChanged");
																									}
																								);
																							}
																						);
																					}
																				);
																			}
																		}
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
			}
		);
	}
);