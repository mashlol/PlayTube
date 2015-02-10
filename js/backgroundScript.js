// -----------------------------------------------------------------------------
// GA
// -----------------------------------------------------------------------------
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-40478447-8']);

(function() {
  var ga = document.createElement('script'); ga.type =
      'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(ga, s);
})();

// -----------------------------------------------------------------------------
// Parse
// -----------------------------------------------------------------------------
Parse.initialize(
  "3LeDXoXIMPlclj6QhtMExSusuH9TIQcF3XSwkRcC",
  "rFGSoWE3oG7tiEidwu0rsaGYxUH1H35Fc3B7aMPf"
);

var User = Parse.User;

var Song = Parse.Object.extend("Song", {
  toJSON: function() {
    return {
      title: this.get("name"),
      video: this.get("videoId"),
      duration: this.get("duration"),
      id: this.id,
    };
  }
});

var Playlist = Parse.Object.extend("Playlist", {
  toJSON: function() {
    return {
      id: this.id,
      name: this.get("name"),
      background: this.get("backgroundVideoId"),
      public: this.get("public") || false,
      owned: this.get("user").id == playTubeUser.id,
    }
  }
});


// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------
var currentVideo = 0;
var currentPlaylist = false; // false means no playlist (all saved songs)
var isPlaying = false;
var volume = 50;
var isShuffle = false;
var isRepeat = true;

var videoTab = false;
var oldActiveTabId;

var savedVideos = [];
var videoOrder = [];
var playTubeUser;

var playlists = {};


// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
var track = function(event, action, label, value) {
  _gaq.push(['_trackEvent', event, action, label, parseInt(value) || undefined]);
};

var sendMessage = function(message, callback) {
  chrome.runtime.sendMessage(message, callback);
};

var getVideoIdFromUrl = function(url) {
  if (url.indexOf("youtube.com") == -1) {
    return false;
  }

  var start = url.indexOf("v=");
  var end = url.indexOf("&", start);

  var video;
  if (end == -1) {
    video = url.substr(start+2);
  } else {
    video = url.substring(start+2, end);
  }

  return video;
};

var generateRandomString = function(length) {
  var str = "";
  for (var x=0; x<length; x++) {
    str += String.fromCharCode(Math.floor(Math.random() * 92 + 33));
  }

  return str;
};

var generateRandomAlphaString = function(length) {
  var str = "";
  for (var x=0; x<length; x++) {
    str += String.fromCharCode(Math.floor(Math.random() * 25 + 97));
  }

  return str;
};

var getAllSongs = function(offset, allSongs, playlist, callback) {
  var songQuery = new Parse.Query(Song);

  if (playlist) {
    songQuery.equalTo("playlist", playlist);
  } else {
    songQuery.equalTo("user", playTubeUser);
  }

  songQuery.ascending("createdAt");
  songQuery.skip(offset).limit(1000);
  songQuery.find().then(function(songs) {
    allSongs = allSongs.concat(songs);

    if (songs.length < 1000) {
      callback(allSongs);
      return;
    }

    getAllSongs(offset + 1000, allSongs, callback);
  }, function() {
    console.log("Error", arguments);
  });
};

var isVideoAlreadySaved = function(videoId) {
  for (var x = 0; x < savedVideos.length; x++) {
    if (savedVideos[x].get("videoId") == videoId) {
      return true;
    }
  }

  return false;
};

var removeSong = function(song) {
  song.destroy();
};

var addSong = function(song) {
  // Save to parse
  var songObj = new Song();
  songObj.set("videoId", song.video);
  songObj.set("name", song.title);
  songObj.set("duration", song.duration);
  songObj.set("user", playTubeUser);
  songObj.setACL(new Parse.ACL(playTubeUser));
  songObj.save().then(function(song) {
    savedVideos.push(song);
    generateNewOrder();
  });
};

var getPlaylist = function(pid) {
  // We don't want to update our songs for the current playlist if it's not ours
  if (pid == currentPlaylist && playlists[currentPlaylist].songs
        && playlists[currentPlaylist].get("user").id != playTubeUser.id) {
    sendMessage({
      action: "recievePlaylistSongs",
      songs: playlists[currentPlaylist].songs,
      name: playlists[currentPlaylist].get("name"),
      id: pid,
      background: playlists[currentPlaylist].get("backgroundVideoId"),
    });

    return;
  }

  var playlist = playlists[pid];

  var relation = playlist.relation("songs");
  relation.query().ascending("createdAt").limit(1000).find()
      .then(function(songs) {
    sendMessage({
      action: "recievePlaylistSongs",
      songs: songs,
      name: playlist.get("name"),
      id: pid,
      background: playlist.get("backgroundVideoId"),
    });

    playlist.songs = songs;
  }, function() {
    console.log("Error", arguments);
  });
};

var generateNewOrder = function(initial) {
  var videos = savedVideos;
  if (currentPlaylist !== false) {
    videos = playlists[currentPlaylist].songs;
  }

  if (initial && isShuffle) {
    var tempList = [];
    for (var x = 0; x < videos.length; x++) {
      if (videoOrder[currentVideo] == x) continue;

      tempList.push({
        number: x,
        random: Math.random(),
      });
    }

    tempList.sort(function(a, b) {
      return a.random - b.random;
    });

    videoOrder = tempList.map(function(x) {
      return x.number;
    });

    return;

  } else if (initial && !isShuffle) {
    videoOrder = [];

    for (var x = 0; x < videos.length; x++) {
      videoOrder.push(x);
    }

    return;
  }

  if (isShuffle) {
    // We want to generate a shuffled list FOLLOWING the current song
    var tempList = [];
    for (var x = 0; x < videos.length; x++) {
      if (videoOrder[currentVideo] == x) continue;

      tempList.push({
        number: x,
        random: Math.random(),
      });
    }

    tempList.sort(function(a, b) {
      return a.random - b.random;
    });

    videoOrder = videoOrder.splice(0, currentVideo + 1)
      .concat(tempList.map(function(x) {
        return x.number;
    }));

  } else {
    videoOrder = videoOrder.splice(0, currentVideo + 1);

    var actualCurrentVideo = videoOrder[currentVideo] || 0;

    for (var x = 0; x < videos.length; x++) {
      videoOrder.push((x + actualCurrentVideo + 1) % videos.length);
    }
  }
};

var createVideoTabIfNotExists = function(callback) {
  if (!videoTab) {
    chrome.tabs.create({active: false}, function(tab) {
      videoTab = tab;

      callback(tab);
    });
  } else {
    chrome.tabs.get(videoTab.id, function(tab) {
      callback(tab);
    });
  }
};

var playVideo = function(video, playlist, relative, restart) {
  if (playlist !== currentPlaylist) {
    var playlistChanged = true;
    currentPlaylist = playlist;
    generateNewOrder(true);
  }

  var videos = savedVideos;

  if (playlist !== false) {
    videos = playlists[playlist].songs;
  }

  if (relative) {
    var relativeVideo = video;
    video = videoOrder[video];
  } else {
    var relativeVideo = 0;
    for (var x in videoOrder) {
      if (videoOrder[x] == video) {
        relativeVideo = x;
        break;
      }
    }
  }

  createVideoTabIfNotExists(function(tab) {
    if (tab.url.indexOf(videos[video].get("videoId")) != -1 && !restart) {
      chrome.tabs.sendMessage(tab.id, {action: "clickVideo"});
    } else {
      chrome.tabs.update(tab.id, {
        url: "https://www.youtube.com/watch?v=" +
                videos[video].get("videoId"),
        pinned: true
      });
    }

    // If we changed songs, record an extra play to this playlist
    // Only if the playlist isn't ours, though
    if ((currentVideo != parseInt(relativeVideo) || playlistChanged)
                                                        && playlist !== false) {
      var playlistObj = playlists[playlist];
      if (playlistObj.get("user").id != playTubeUser.id) {
        Parse.Cloud.run('playlistView', {playlist: playlist}).then(function() {
        }, function() {
          console.log("Error");
        });
      }
    }

    currentVideo = parseInt(relativeVideo);
    isPlaying = true;

    sendMessage({
      action: "currentVideoUpdate",
      currentVideo: video,
    });
  });
};

var sendState = function() {
  var videos = savedVideos;

  if (currentPlaylist !== false) {
    videos = playlists[currentPlaylist].songs;
  }

  var curSongObj = videos[videoOrder[currentVideo]];
  if (curSongObj) {
    var currentTitle = curSongObj.get("name");
    var currentDuration = curSongObj.get("duration");
  } else {
    var currentTitle = "";
    var currentDuration = "";
  }


  sendMessage({
    action: "updateState",
    videos: savedVideos,
    currentVideo: videoOrder[currentVideo],
    currentTitle: currentTitle,
    currentDuration: currentDuration,
    currentPlaylist: currentPlaylist,
    isPlaying: isPlaying,
    volume: volume,
    isShuffle: isShuffle,
    isRepeat: isRepeat,
    playlists: playlists,
  });
};

var pauseVideo = function() {
  if (!isPlaying) {
    return;
  }

  chrome.tabs.sendMessage(videoTab.id, {action: "clickVideo"});

  isPlaying = false;
};

var nextVideo = function() {
  if (currentVideo == videoOrder.length - 1) {
    // If we're shuffling we need to create a new order of shuffled songs
    // If we're not shuffling, this won't really do anything
    generateNewOrder();
  }
  playVideo(currentVideo + 1 % videoOrder.length, currentPlaylist, true, true);
};

var previousVideo = function() {
  if (currentVideo == 0) {
    playVideo(videoOrder.length - 1, currentPlaylist, true, true);
  } else {
    playVideo(currentVideo - 1, currentPlaylist, true, true);
  }
};

var updatePlaylistSongACLs = function(playlist) {
  var relation = playlist.relation("songs");

  relation.query().limit(1000).find().then(function(songs) {
    for (var x in songs) {
      var song = songs[x];

      var acl = new Parse.ACL(song.get("user"));

      if (playlist.get("public")) {
        acl.setPublicReadAccess(true);
      }

      song.setACL(acl);
      song.save();
    }
  });
};


// -----------------------------------------------------------------------------
// Chrome stuff
// -----------------------------------------------------------------------------

// Try to login
var tryLogin = function(callback) {
  chrome.storage.sync.get("user", function(items) {
    // If we can login, we'll fetch our data from Parse
    if (items.user && items.user.username && items.user.password) {
      User.logIn(items.user.username, items.user.password).then(function(user) {
        playTubeUser = user;

        getAllSongs(0, [], null, function(songs) {
          for (var x in songs) {
            var song = songs[x];

            savedVideos.push(song);
          }

          generateNewOrder(true);

          var query = new Parse.Query(Playlist);
          query.equalTo("user", user);
          query.limit(1000);
          query.find().then(function(plists) {
            for (var x in plists) {
              var plist = plists[x];

              playlists[plist.id] = plist;
            }

            callback(true);
          }, function() {
            console.log("Error", arguments);
            callback(false);
          });
        });
      }, function(error) {
        console.log("Error", arguments);
        callback(false);
      });
    } else {
      // Otherwise, we need to make a new user and save it
      var username = generateRandomString(20);
      var password = generateRandomString(20);

      var user = new User();
      user.set("username", username);
      user.set("password", password);
      user.set(
        "email",
        generateRandomAlphaString(10) +
          "@" +
          generateRandomAlphaString(10) +
          ".com"
      );
      user.signUp().then(function(user) {
        playTubeUser = user;

        chrome.storage.sync.set({
          user: {
            username: username,
            password: password
          }
        });

        callback(true);
      }, function() {
        console.log("Error", arguments);
        callback(false);
      });
    }
  });
};

// Might as well try to login right away, it might not work, but would make
// first launch faster if it does work.
tryLogin(function(){});


chrome.tabs.getSelected(null, function(tab) {
  oldActiveTabId = tab.id;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  if (tabId == videoTab.id) {
    isPlaying = false;
    videoTab = false;
  }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  // TODO possibly add this back
  // if (tabId == videoTab.id && changeInfo.url &&
  //       getVideoIdFromUrl(changeInfo.url) != savedVideos[videoOrder[currentVideo]].video) {
  //   isPlaying = false;
  //   sendMessage({action: "update", isPlaying: false});
  // }

  if (changeInfo.url && changeInfo.url.indexOf("youtube") != -1) {
    chrome.tabs.getSelected(null, function(tab) {
      chrome.tabs.sendMessage(tab.id, {action: "urlChanged"});
    });
  }
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
  var tabId = activeInfo.tabId;
  if (tabId == videoTab.id) {
    chrome.tabs.update(oldActiveTabId, {active: true});
  } else {
    oldActiveTabId = activeInfo.tabId;
  }
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(request);

    if (request.action == "play") {
      playVideo(request.video, request.playlist);
    }

    if (request.action == "pause") {
      pauseVideo();
    }

    if (request.action == "songEnded") {
      var videos = savedVideos;

      if (currentPlaylist !== false) {
        videos = playlists[currentPlaylist].songs;
      }

      var curSongObj = videos[videoOrder[currentVideo]];

      track("song", "ended", curSongObj.get("videoId"));
    }

    if (request.action == "next" || request.action == "songEnded") {
      nextVideo();
    }

    if (request.action == "previous") {
      previousVideo();
    }

    if (request.action == "state") {
      if (!playTubeUser) {
        sendResponse({
          error: "No user yet"
        });

        tryLogin(function(success) {
          console.log("tryLogin", success);
          if (success) {
            sendState();
          } else {
            sendMessage({
              action: "error",
              error: "Unable to load, please try relaunching the app",
            });
          }
        });
      } else {
        sendState();
      }
    }

    if (request.action == "add") {
      if (request.shortcut) {
        track("song", "addedFromShortcut", request.video);
      }

      addSong({
        video: request.video,
        title: request.title,
        duration: request.duration,
      });
    }

    if (request.action == "addPlaylist") {
      var name = request.name;

      var playlist = new Playlist();
      playlist.set("name", name);
      playlist.set("user", playTubeUser);
      playlist.setACL(new Parse.ACL(playTubeUser));
      playlist.save().then(function(playlist) {
        playlists[playlist.id] = playlist;

        sendMessage({
          action: "addPlaylistEle",
          playlist: playlist,
        });
      });
    }

    if (request.action == "getPlaylistSongs") {
      getPlaylist(request.playlist);
    }

    if (request.action == "playlistAddSong") {
      var playlist = playlists[request.playlist];
      var song = savedVideos[request.song];

      var relation = playlist.relation("songs");

      relation.add(song);
    }

    if (request.action == "playlistRemoveSong") {
      var playlist = playlists[request.playlist];
      var song = savedVideos[request.song];

      var relation = playlist.relation("songs");

      relation.remove(song);
    }

    if (request.action == "editModeLeave") {
      var playlist = playlists[request.playlist];

      playlist.save().then(function(playlist) {
        // Add a new background for this playlist
        var relation = playlist.relation("songs");

        return relation.query().ascending("createdAt").limit(1).find();
      }).then(function(songs) {
        if (songs.length > 0) {
          playlist.set("backgroundVideoId", songs[0].get("videoId"));
        }

        return playlist.save();
      }).then(function() {
        updatePlaylistSongACLs(playlist);
        getPlaylist(request.playlist);
      });
    }

    if (request.action == "renamePlaylist") {
      playlists[request.playlist].set("name", request.name);
      playlists[request.playlist].save();
    }

    if (request.action == "removePlaylist") {
      if (currentPlaylist == request.playlist) {
        pauseVideo();

        currentPlaylist = false;
        currentVideo = 0;
        generateNewOrder();
      }

      playlists[request.playlist].destroy();
      delete playlists[request.playlist];
    }

    if (request.action == "playlistChangePublic") {
      var playlist = playlists[request.playlist];

      playlist.set("public", request.public);
      var newACL = new Parse.ACL(playTubeUser);
      if (request.public) {
        newACL.setPublicReadAccess(true);
      }
      playlist.setACL(newACL);
      playlist.save();

      updatePlaylistSongACLs(playlist);
    }

    if (request.action == "remove") {
      var removedSong = savedVideos.splice(request.video, 1)[0];

      var toRemove = [];

      for (var x in videoOrder) {
        var vidId = videoOrder[x];

        // We need to remove anything which references the highest song
        // since there's one less song now.
        // Anything we remove that's before our current song, we should also
        // decrease the current song index so we account for that.
        if (vidId == savedVideos.length) {
          toRemove.push(x);
          if (currentVideo > x) {
            currentVideo--;
          }
        }
      }

      for (var x in toRemove) {
        videoOrder.splice(toRemove[x], 1);
      }

      removeSong(removedSong);
    }


    if (request.action == "browse") {
      var query = new Parse.Query(Playlist);
      query.equalTo("public", true);
      query.exists("backgroundVideoId");
      query.descending("num_plays");
      query.find().then(function(plists) {
        for (var x in plists) {
          var plist = plists[x];

          if (playlists[plist.id]) {
            var songs = playlists[plist.id].songs;
          }

          playlists[plist.id] = plist;
          playlists[plist.id].songs = songs;
        }

        sendMessage({
          action: "updatePublicPlaylists",
          playlists: plists,
        });
      });
    }

    if (request.action == "isPlayTab") {
      sendResponse({
        isPlayTab: videoTab.id == sender.tab.id,
        volume: volume,
      });
    }

    if (request.action == "updateVolume") {
      chrome.tabs.sendMessage(videoTab.id, {
        action: "updateVolume",
        volume: request.volume
      });
      volume = request.volume;
    }

    if (request.action == "updateLocation") {
      chrome.tabs.sendMessage(videoTab.id, {
        action: "updateLocation",
        location: request.location
      });
    }

    if (request.action == "isVideoAlreadySaved") {
      sendResponse(isVideoAlreadySaved(request.videoId));
    }

    if (request.action == "shuffleToggle") {
      isShuffle = request.isShuffle;

      generateNewOrder();
    }

    if (request.action == "openInTab") {
      chrome.tabs.create({url: chrome.extension.getURL('index.html')});
    }
  }
);


chrome.commands.onCommand.addListener(function(command) {
  if (command == "mediaNextSong") {
    nextVideo();
    track("hotkey", "mediaNextSong");
  }

  if (command == "mediaPreviousSong") {
    previousVideo();
    track("hotkey", "mediaPreviousSong");
  }

  if (command == "mediaPlayPause") {
    track("hotkey", "mediaPlayPause");
    if (!isPlaying) {
      playVideo(currentVideo, currentPlaylist, true);
    } else {
      pauseVideo();
    }
  }
});


// This is to tell the content script to update our video
var ticker = function() {
  if (!videoTab) {
    return;
  }

  chrome.tabs.sendMessage(videoTab.id, {
    action: "tick"
  });
};

setInterval(ticker, 40);
