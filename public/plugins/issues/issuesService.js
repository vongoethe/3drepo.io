/**
 *  Copyright (C) 2014 3D Repo Ltd
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function () {
    "use strict";

    angular.module('3drepo')
        .factory('NewIssuesService', NewIssuesService);

    NewIssuesService.$inject = ["$http", "$q", "StateManager", "serverConfig", "ViewerService", "Auth"];

    function NewIssuesService($http, $q, StateManager, serverConfig, ViewerService, Auth) {
        var state = StateManager.state,
            url = "",
            data = {},
            config = {},
            i, j = 0,
            numIssues = 0,
            numComments = 0,
            pinRadius = 0.25,
            pinHeight = 1.0;

		// TODO: Internationalise and make globally accessible
        var getPrettyTime = function(time) {
            var date = new Date(time),
				currentDate = new Date(),
				prettyTime,
				postFix,
				hours,
				monthToText = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

			if ((date.getFullYear() === currentDate.getFullYear()) &&
				(date.getMonth() === currentDate.getMonth()) &&
				(date.getDate() === currentDate.getDate())) {
				hours = date.getHours();
				if (hours > 11) {
					postFix = " PM";
					if (hours > 12) {
						hours -= 12;
					}
				} else {
					postFix = " AM";
					if (hours === 0) {
						hours = 12;
					}
				}
				prettyTime = hours + ":" + date.getMinutes() + postFix;
			} else if (date.getFullYear() === currentDate.getFullYear()) {
				prettyTime = date.getDate() + " " + monthToText[date.getMonth()];
			} else {
				prettyTime = monthToText[date.getMonth()] + " '" + (currentDate.getFullYear()).toString().slice(-2);
			}

            return prettyTime;
        };

        var getIssues = function () {
            var deferred = $q.defer();
            url = serverConfig.apiUrl(state.account + '/' + state.project + '/issues.json');

            $http.get(url)
                .then(
					function(data) {
						deferred.resolve(data.data);
						for (i = 0, numIssues = data.data.length; i < numIssues; i += 1) {
							data.data[i].timeStamp = getPrettyTime(data.data[i].created);

							if (data.data[i].hasOwnProperty("comments")) {
								for (j = 0, numComments = data.data[i].comments.length; j < numComments; j += 1) {
									if (data.data[i].comments[j].hasOwnProperty("created")) {
										data.data[i].comments[j].timeStamp = getPrettyTime(data.data[i].comments[j].created);
									}
								}
							}
						}
					},
					function () {
						deferred.resolve([]);
					}
                );

            return deferred.promise;
        };

        var saveIssue = function (issue) {
            var dataToSend,
                deferred = $q.defer();

            url = serverConfig.apiUrl(issue.account + "/" + issue.project + "/issues/" + issue.objectId);

            data = {
                name: issue.name,
                viewpoint: ViewerService.defaultViewer.getCurrentViewpointInfo(),
                scale: 1.0,
				creatorRole: issue.creatorRole
            };
            config = {
                withCredentials: true
            };

            if (issue.pickedPos !== null) {
                data.position = issue.pickedPos.toGL();
                data.norm = issue.pickedNorm.toGL();
            }

            dataToSend = {data: JSON.stringify(data)};

            $http.post(url, dataToSend, config)
                .then(function successCallback(response) {
                    console.log(response);
                    response.data.issue._id     = response.data.issue_id;
                    response.data.issue.account = issue.account;
                    response.data.issue.project = issue.project;
                    response.data.issue.timeStamp = getPrettyTime(response.data.issue.created);
					response.data.issue.creatorRole = issue.creatorRole;

                    removePin();
                    deferred.resolve(response.data.issue);
                });

            return deferred.promise;
        };

        function doPost(issue, data) {
            var deferred = $q.defer();
            url = serverConfig.apiUrl(issue.account + "/" + issue.project + "/issues/" + issue.parent);
            config = {
                withCredentials: true
            };
            data._id = issue._id;
            $http.post(url, {data: JSON.stringify(data)}, config)
                .then(function (response) {
                    deferred.resolve(response.data);
                });
            return deferred.promise;
        }

        var closeIssue = function (issue) {
            return doPost(issue, {closed: true, number: issue.number});
        };

        var saveComment = function (issue, comment) {
            return doPost(issue, {comment: comment, number: issue.number});
        };

        var editComment = function (issue, comment, commentIndex) {
            return doPost(issue, {comment: comment, number: issue.number, edit: true, commentIndex: commentIndex});
        };

        var deleteComment = function (issue, index) {
            return doPost(issue, {comment: "", number: issue.number, delete: true, commentCreated: issue.comments[index].created});
        };

        var setComment = function (issue, commentIndex) {
            return doPost(issue, {comment: "", number: issue.number, set: true, commentIndex: commentIndex});
        };

        function addPin (pin, colour) {
            removePin();
            createPinShape("pinPlacement", pin, pinRadius, pinHeight, colour);
         }

        function removePin () {
            var pinPlacement = document.getElementById("pinPlacement");
            if (pinPlacement !== null) {
               pinPlacement.parentElement.removeChild(pinPlacement);
            }
        }

        function fixPin (pin, colour) {
            createPinShape(pin.id, pin, pinRadius, pinHeight, colour);
        }

        function createPinShape (id, pin, radius, height, colour)
        {
            var sceneBBox = ViewerService.defaultViewer.scene._x3domNode.getVolume();
            var sceneSize = sceneBBox.max.subtract(sceneBBox.min).length();
            var scale     = sceneSize / 20;

            if (ViewerService.defaultViewer.pinSize)
            {
                scale = ViewerService.defaultViewer.pinSize;
            }

            var parent = document.createElement("MatrixTransform");
            parent.setAttribute("id", id);

            var inlines = $("inline");
            var trans = null;

            for (var i = 0; i < inlines.length; i++)
            {
                if (inlines[i].getAttribute("nameSpaceName") === (pin.account + "__" + pin.project))
                {
                    trans = inlines[i]._x3domNode.getCurrentTransform();
                    break;
                }
            }

			if (trans !== null) {
				parent.setAttribute("matrix", trans.toGL());
			}

            var norm = new x3dom.fields.SFVec3f(pin.norm[0], pin.norm[1], pin.norm[2]);

            // Transform the normal into the coordinate frame of the parent
            var axisAngle = ViewerService.defaultViewer.rotAxisAngle([0,1,0], norm.toGL());

            var modelTransform = document.createElement("Transform");
            modelTransform.setAttribute("rotation", axisAngle.toString());

            var position = new x3dom.fields.SFVec3f(pin.position[0], pin.position[1], pin.position[2]);

            // Transform the pin into the coordinate frame of the parent
            modelTransform.setAttribute("translation", position.toString());

            parent.appendChild(modelTransform);

            var coneHeight = height - radius;
            var pinshape = document.createElement("Group");
            pinshape.setAttribute('onclick', 'clickPin(event)');

            var pinshapeapp = document.createElement("Appearance");
            pinshape.appendChild(pinshapeapp);

            var pinshapedepth = document.createElement("DepthMode");
            pinshapedepth.setAttribute("depthFunc", "ALWAYS");
            pinshapedepth.setAttribute("enableDepthTest", "false");
            pinshapeapp.appendChild(pinshapedepth);

            var pinshapemat = document.createElement("Material");
			if (typeof colour === "undefined") {
				pinshapemat.setAttribute("diffuseColor", "1.0 0.0 0.0");
			}
			else {
				pinshapemat.setAttribute("diffuseColor", colour[0] + " " + colour[1] + " " + colour[2]);
			}
            pinshapeapp.appendChild(pinshapemat);

            var pinshapescale = document.createElement("Transform");
            pinshapescale.setAttribute("scale", scale + " " + scale + " " + scale);
            pinshape.appendChild(pinshapescale);

            var pinshapeconetrans = document.createElement("Transform");
            pinshapeconetrans.setAttribute("translation", "0.0 " + (0.5 * coneHeight) + " 0.0");
            pinshapescale.appendChild(pinshapeconetrans);

            var pinshapeconerot = document.createElement("Transform");

            pinshapeconerot.setAttribute("rotation", "1.0 0.0 0.0 3.1416");
            pinshapeconetrans.appendChild(pinshapeconerot);

            var pinshapeconeshape = document.createElement("Shape");
            pinshapeconerot.appendChild(pinshapeconeshape);

            var pinshapecone = document.createElement("Cone");
            pinshapecone.setAttribute("bottomRadius", (radius * 0.5).toString());
            pinshapecone.setAttribute("height", coneHeight.toString());

            var coneApp = pinshapeapp.cloneNode(true);

            pinshapeconeshape.appendChild(pinshapecone);
            pinshapeconeshape.appendChild(coneApp);

            var pinshapeballtrans = document.createElement("Transform");
            pinshapeballtrans.setAttribute("translation", "0.0 " + coneHeight + " 0.0");
            pinshapescale.appendChild(pinshapeballtrans);

            var pinshapeballshape = document.createElement("Shape");
            pinshapeballtrans.appendChild(pinshapeballshape);

            var pinshapeball = document.createElement("Sphere");
            pinshapeball.setAttribute("radius", radius);

            var ballApp = pinshapeapp.cloneNode(true);

            pinshapeballshape.appendChild(pinshapeball);
            pinshapeballshape.appendChild(ballApp);

            modelTransform.appendChild(pinshape);

            $("#model__root")[0].appendChild(parent);
        }

		var getRoles = function () {
			var deferred = $q.defer();
			url = serverConfig.apiUrl(state.account + '/' + state.project + '/roles.json');

			$http.get(url)
				.then(
					function(data) {
						deferred.resolve(data.data);
					},
					function () {
						deferred.resolve([]);
					}
				);

			return deferred.promise;
		};

		var getUserRolesForProject = function () {
			var deferred = $q.defer();
			url = serverConfig.apiUrl(state.account + "/" + state.project + "/" + Auth.username + "/userRolesForProject.json");

			$http.get(url)
				.then(
					function(data) {
						console.log(data);
						deferred.resolve(data.data);
					},
					function () {
						deferred.resolve([]);
					}
				);

			return deferred.promise;
		};

		var hexToRgb = function (hex) {
			var hexColours = [];

			if (hex.charAt(0) === "#") {
				hex = hex.substr(1);
			}

			if (hex.length === 6) {
				hexColours.push(hex.substr(0, 2));
				hexColours.push(hex.substr(2, 2));
				hexColours.push(hex.substr(4, 2));
			}
			else if (hex.length === 3) {
				hexColours.push(hex.substr(0, 1) + hex.substr(0, 1));
				hexColours.push(hex.substr(1, 1) + hex.substr(1, 1));
				hexColours.push(hex.substr(2, 1) + hex.substr(2, 1));
			}
			else {
				hexColours = ["00", "00", "00"];
			}

			return [(parseInt(hexColours[0], 16) / 255.0), (parseInt(hexColours[1], 16) / 255.0), (parseInt(hexColours[2], 16) / 255.0)];
		};

		return {
            getPrettyTime: getPrettyTime,
            getIssues: getIssues,
            saveIssue: saveIssue,
            closeIssue: closeIssue,
            saveComment: saveComment,
            editComment: editComment,
            deleteComment: deleteComment,
            setComment: setComment,
            addPin: addPin,
            fixPin: fixPin,
            removePin: removePin,
			state: state,
			getRoles: getRoles,
			getUserRolesForProject: getUserRolesForProject,
			hexToRgb: hexToRgb
        };
    }
}());
