goog.provide('main');

goog.require('spriter');
goog.require('atlas');
goog.require('RenderCtx2D');
goog.require('RenderWebGL');

var enemy_id = -1;
var enemy_anim_key = 'idle';
set_enemy = function(id) {
	enemy_id = id;
}

set_anim = function(key) {
	enemy_anim_key = key;
}

main.start = function (div) {

  var div_element = document.getElementById(div);
  var canvas = document.createElement('canvas');
  canvas.width = div_element.offsetWidth;
  canvas.height = div_element.offsetHeight;
  canvas.style.position = 'absolute';
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  canvas.style.zIndex = -1; // behind controls

  div_element.appendChild(canvas);

  var ctx = canvas.getContext('2d');

  window.addEventListener('resize', function() {
    canvas.width = div_element.offsetWidth;
    canvas.height = div_element.offsetHeight;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  });

  var render_ctx2d = new RenderCtx2D(ctx);

  var canvas_gl = document.createElement('canvas');
  canvas_gl.width = div_element.offsetWidth;
  canvas_gl.height = div_element.offsetHeight;
  canvas_gl.style.position = 'absolute';
  canvas_gl.style.width = canvas_gl.width + 'px';
  canvas_gl.style.height = canvas_gl.height + 'px';
  canvas_gl.style.zIndex = -2; // behind 2D context canvas

  div_element.appendChild(canvas_gl);

  var gl = canvas_gl.getContext('webgl') || canvas_gl.getContext('experimental-webgl');

  window.addEventListener('resize', function() {
    canvas_gl.width = div_element.offsetWidth;
    canvas_gl.height = div_element.offsetHeight;
    canvas_gl.style.width = canvas_gl.width + 'px';
    canvas_gl.style.height = canvas_gl.height + 'px';
  });

  var render_webgl = new RenderWebGL(gl);
  
  var canvas_bg = document.createElement('canvas');
  canvas_bg.width = div_element.offsetWidth;
  canvas_bg.height = div_element.offsetHeight;
  canvas_bg.style.position = 'absolute';
  canvas_bg.style.width = canvas_bg.width + 'px';
  canvas_bg.style.height = canvas_bg.height + 'px';
  canvas_bg.style.zIndex = -3; // behind gl

  div_element.appendChild(canvas_bg);

  var ctx_bg = canvas_bg.getContext('2d');
  const img_bg = new Image();
  img_bg.src = 'Cartoon_Forest_BG_01.png';
  img_bg.onload = () => { ctx_bg.drawImage(img_bg, 0, 0, img_bg.width, img_bg.height, 0, 0, ctx_bg.canvas.width, ctx_bg.canvas.height); };
  
  var canvas_ground = document.createElement('canvas');
  canvas_ground.width = div_element.offsetWidth;
  canvas_ground.height = div_element.offsetHeight;
  canvas_ground.style.position = 'absolute';
  canvas_ground.style.width = canvas_ground.width + 'px';
  canvas_ground.style.height = canvas_ground.height + 'px';
  canvas_ground.style.zIndex = -1; // above

  div_element.appendChild(canvas_ground);

  var ctx_ground = canvas_ground.getContext('2d');
  const img_ground = new Image();
  img_ground.src = 'Cartoon_Forest_BG_01_ground.png';
  img_ground.onload = () => { ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, 0, 0, ctx_ground.canvas.width, ctx_ground.canvas.height); };
  
  window.addEventListener('resize', function() {
    canvas_bg.width = div_element.offsetWidth;
    canvas_bg.height = div_element.offsetHeight;
    canvas_bg.style.width = canvas_bg.width + 'px';
    canvas_bg.style.height = canvas_bg.height + 'px';
	ctx_bg.drawImage(img_bg, 0, 0, img_bg.width, img_bg.height, 0, 0, ctx_bg.canvas.width, ctx_bg.canvas.height);
	
	canvas_ground.width = div_element.offsetWidth;
    canvas_ground.height = div_element.offsetHeight;
    canvas_ground.style.width = canvas_ground.width + 'px';
    canvas_ground.style.height = canvas_ground.height + 'px';
	ctx_ground.drawImage(img_ground, 0, 0, img_ground.width, img_ground.height, 0, 0, ctx_ground.canvas.width, ctx_ground.canvas.height);
  });

  var camera_x = 0;
  var camera_y = 0;
  var camera_zoom = 1;
  //var absolute_x = 490;
  //var absolute_y = 500;
  var enemy_pos_x = 0.3;
  var enemy_pos_y = 0.925;

  var enable_render_webgl = !!gl;
  var enable_render_ctx2d = !!ctx && !enable_render_webgl;

  var enable_render_debug_pose = false;

  // sound player (Web Audio Context)
  var player_web = {};
  player_web.ctx = AudioContext && new AudioContext();
  player_web.mute = true;
  player_web.sounds = {};

  var spriter_data = null;
  var spriter_pose = null;
  var spriter_pose_next = null;
  var atlas_data = null;

  var anim_time = 0;
  var anim_length = 0;
  var anim_rate = 1;
  var anim_repeat = 1;

  var alpha = 1.0;

  var loadFile = function(file, callback) {
    render_ctx2d.dropData(spriter_data, atlas_data);
    render_webgl.dropData(spriter_data, atlas_data);

    spriter_pose = null;
    spriter_pose_next = null;
    atlas_data = null;

    var file_path = file.path;
    var file_spriter_url = file_path + file.spriter_url;
    var file_atlas_url = (file.atlas_url) ? (file_path + file.atlas_url) : ("");

    loadText(file_spriter_url, function(err, text) {
      if (err) {
        callback();
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
        spriter_data = new spriter.Data().load(spriter_json);
      } else {
        spriter_data = new spriter.Data().load(JSON.parse(text));
      }

      spriter_pose = new spriter.Pose(spriter_data);
      spriter_pose_next = new spriter.Pose(spriter_data);

      loadText(file_atlas_url, function(err, atlas_text) {
        var images = {};

        var counter = 0;
        var counter_inc = function() {
          counter++;
        }
        var counter_dec = function() {
          if (--counter === 0) {
            render_ctx2d.loadData(spriter_data, atlas_data, images);
            render_webgl.loadData(spriter_data, atlas_data, images);
            callback();
          }
        }

        counter_inc();

        if (!err && atlas_text) {
          atlas_data = new atlas.Data().importTpsText(atlas_text);

          // load atlas page images
          var dir_path = file_atlas_url.slice(0, file_atlas_url.lastIndexOf('/'));
          atlas_data.pages.forEach(function(page) {
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
          spriter_data.folder_array.forEach(function(folder) {
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
        spriter_data.folder_array.forEach(function(folder) {
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

  //add_file("GreyGuy/", "player.scon", "player.tps.json");
  //add_file("GreyGuyPlus/", "player_006.scon", "player_006.tps.json");
  //add_file("SCML/wizard_1/", "1.scml");
  //add_file("SCML/wizard_2/", "2.scml");
  //add_file("SCML/wizard_3/", "3.scml");
  //add_file("SCML/pirate_1/", "1.scml");
  //add_file("SCML/pirate_2/", "2.scml");
  //add_file("SCML/pirate_3/", "3.scml");
  
 /* add_file("SCML/b1/", "1.scml", 0.3, 200);
  add_file("SCML/b2/", "2.scml", 0.3, 300);
  add_file("SCML/b3/", "3.scml", 0.3);
  add_file("SCML/b4/", "4.scml", 0.3);
  add_file("SCML/b5/", "5.scml", 0.3);
  add_file("SCML/b6/", "6.scml", 0.3, 80);
  add_file("SCML/b7/", "7.scml", 0.3);
  add_file("SCML/b8/", "8.scml", 0.3, 80);
  add_file("SCML/b9/", "9.scml", 0.3);
  add_file("SCML/b10/", "10.scml", 0.3, 250);
  add_file("SCML/a1/", "1.scml", 0.3);
  add_file("SCML/a2/", "2.scml", 0.3);
  add_file("SCML/a3/", "3.scml", 0.3);
  add_file("SCML/a4/", "4.scml", 0.3);
  add_file("SCML/a5/", "5.scml", 0.3);
  add_file("SCML/a6/", "6.scml", 0.3);
  add_file("SCML/a7/", "7.scml", 0.3);
  add_file("SCML/a8/", "8.scml", 0.3);
  add_file("SCML/a9/", "9.scml", 0.3);
  add_file("SCML/a10/", "10.scml", 0.3);
  
  add_file("SCML/1_ORK/", "1_ork.scml", 0.3, 150);
  add_file("SCML/2_ORK/", "2_ork.scml", 0.3, 150);
  add_file("SCML/3_ORK/", "3_ork.scml", 0.3, 150);
  
  add_file("SCML/1_KNIGHT/", "1_KNIGHT.scml", 0.2, 350);
  add_file("SCML/2_KNIGHT/", "2_KNIGHT.scml", 0.2, 350);
  add_file("SCML/3_KNIGHT/", "3_KNIGHT.scml", 0.2, 350);
  
  // kicsit fel
  add_file("SCML/elf_1/", "1.scml", 0.2, 150);
  add_file("SCML/elf_2/", "2.scml", 0.2, 250);
  add_file("SCML/elf_3/", "3.scml", 0.2, 200);
  
  
  add_file("SCML/1_troll/", "1_troll.scml", 0.8, 280);
  add_file("SCML/2_troll/", "2_troll.scml", 0.8, 280);
  add_file("SCML/3_troll/", "3_troll.scml", 0.8, 280);
  
  
  add_file("SCML/woman_warrior_1/", "1.scml", 0.2);
  add_file("SCML/woman_warrior_2/", "2.scml", 0.2);
  add_file("SCML/woman_warrior_3/", "3.scml", 0.2);
  
  add_file("SCML/minotaur_1/", "Animations.scml", 1);
  add_file("SCML/minotaur_2/", "Animations.scml", 1);
  add_file("SCML/minotaur_3/", "Animations.scml", 1);
  
  add_file("SCML/Golem_1/", "Animations.scml", 1);
  add_file("SCML/Golem_2/", "Animations.scml", 1);
  add_file("SCML/Golem_3/", "Animations.scml", 1);
  
  
  
  add_file("SCML/reaper_1/", "Animations.scml", 0.4);
  add_file("SCML/reaper_2/", "Animations.scml", 0.4);
  add_file("SCML/reaper_3/", "Animations.scml", 0.4);
  
  add_file("SCML/satyr_1/", "Animations.scml", 1);
  add_file("SCML/satyr_2/", "Animations.scml", 1);
  add_file("SCML/satyr_3/", "Animations.scml", 1);
  
  add_file("SCML/wraith_1/", "Animations.scml", 1);
  add_file("SCML/wraith_2/", "Animations.scml", 1);
  add_file("SCML/wraith_3/", "Animations.scml", 1);
  
  add_file("SCML/GolemB_1/", "Animations.scml", 1);
  add_file("SCML/GolemB_2/", "Animations.scml", 1);
  add_file("SCML/GolemB_3/", "Animations.scml", 1);
  
  add_file("SCML/fairy_1/", "1.scml", 0.2);
  add_file("SCML/fairy_2/", "2.scml", 0.2);
  add_file("SCML/fairy_3/", "3.scml", 0.2);*/
  
  
  add_file("SCML/woman_warrior_1/", "1.scml", 0.2);
  add_file("SCML/GolemB_1/", "Animations.scml", 1);
  add_file("SCML/1_troll/", "1_troll.scml", 0.8, 280);
  add_file("SCML/minotaur_1/", "Animations.scml", 1);
  
  var file_index = 0;
  
  var loading = false;

  var file = files[file_index];
  var anim_key = 'idle';
 
  loading = true;
  loadFile(file, function() {
    loading = false;
    var entity_key = spriter_data.getEntityKeys()[0];
    spriter_pose.setEntity(entity_key);
    spriter_pose.setAnim(anim_key);
    spriter_pose.setTime(anim_time = 0);
    anim_length = spriter_pose.curAnimLength() || 1000;
  });

  var prev_time = 0;
 

  var loop = function(time) {
    requestAnimationFrame(loop);

    var dt = time - (prev_time || time);
    prev_time = time; // ms

    var entity_key;
    if (enemy_id!=-1 && enemy_id!=file_index)
	{
	  file_index = enemy_id;
	  file = files[file_index];
	  loading = true;
	  loadFile(file, function() {
		loading = false;
		var entity_key = spriter_data.getEntityKeys()[0];
		spriter_pose.setEntity(entity_key);
		anim_key = 'idle';
		spriter_pose.setAnim(anim_key);
		spriter_pose.setTime(anim_time = 0);
		anim_length = spriter_pose.curAnimLength() || 1000;
	  });
	  return;
	}	
	
    if (!loading) {
      spriter_pose.update(dt * anim_rate);
      anim_time += dt * anim_rate;

      if (anim_time >= (anim_length * anim_repeat) && anim_key!='idle') {
		if (anim_key=='die')
		{
			//anim_time = anim_length-1;
			//console.log('die end '+anim_length);
		}
		else
		{
			console.log('anim ' + anim_key +' -> idle');
			entity_key = spriter_data.getEntityKeys()[0];
			anim_key = 'idle';
			spriter_pose.setAnim(anim_key);
			spriter_pose.setTime(anim_time = 0);
			anim_length = spriter_pose.curAnimLength() || 1000;
		}
      }
	  
	  if (enemy_anim_key!='' && enemy_anim_key!=anim_key)
	  {
		entity_key = spriter_data.getEntityKeys()[0];
		spriter_pose.setEntity(entity_key);
		anim_key = enemy_anim_key;
		enemy_anim_key='';
		spriter_pose.setAnim(anim_key);
		spriter_pose.setTime(anim_time = 0);
	    anim_length = spriter_pose.curAnimLength() || 1000;
	  }
    }

    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    if (gl) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (loading) {
      return;
    }
	
	if (anim_key!='die' || anim_time<anim_length)
	{
		spriter_pose.strike();
	}
    //spriter_pose_next.strike();

    spriter_pose.sound_array.forEach(function(sound) {
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
    });

    // compute bone world space
    spriter_pose.bone_array.forEach(function(bone) {
      var parent_bone = spriter_pose.bone_array[bone.parent_index];
      if (parent_bone) {
        spriter.Space.combine(parent_bone.world_space, bone.local_space, bone.world_space);
      } else {
        bone.world_space.copy(bone.local_space);
      }
    });

    // compute object world space
    spriter_pose.object_array.forEach(function(object) {
      switch (object.type) {
        case 'sprite':
          var bone = spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          var folder = spriter_data.folder_array[object.folder_index];
          var file = folder && folder.file_array[object.file_index];
          if (file) {
            var offset_x = (0.5 - object.pivot.x) * file.width;
            var offset_y = (0.5 - object.pivot.y) * file.height;
            spriter.Space.translate(object.world_space, offset_x, offset_y);
          }
          break;
        case 'bone':
          var bone = spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          break;
        case 'box':
          var bone = spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          var entity = spriter_pose.curEntity();
          var box_info = entity.obj_info_map[object.name];
          if (box_info) {
            var offset_x = (0.5 - object.pivot.x) * box_info.w;
            var offset_y = (0.5 - object.pivot.y) * box_info.h;
            spriter.Space.translate(object.world_space, offset_x, offset_y);
          }
          break;
        case 'point':
          var bone = spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          break;
        case 'sound':
          break;
        case 'entity':
          var bone = spriter_pose.bone_array[object.parent_index];
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

    if (ctx) {
      ctx.globalAlpha = alpha;

      // origin at center, x right, y up
      //ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
	  ctx.translate(ctx.canvas.width*enemy_pos_x, ctx.canvas.height*enemy_pos_y-file.shift_y);
      ctx.scale(1, -1);

      if (enable_render_ctx2d && enable_render_webgl) {
        ctx.translate(-ctx.canvas.width / 4, 0);
      }

      ctx.translate(-camera_x, -camera_y);
      ctx.scale(camera_zoom*file.scale, camera_zoom*file.scale);
      ctx.lineWidth = 1 / (camera_zoom*file.scale);

      if (enable_render_ctx2d) {
        render_ctx2d.drawPose(spriter_pose, atlas_data);
        //ctx.translate(0, -10);
        //render_ctx2d.drawPose(spriter_pose_next, atlas_data);
      }

      if (enable_render_debug_pose) {
        render_ctx2d.drawDebugPose(spriter_pose, atlas_data);
        //ctx.translate(0, -10);
        //render_ctx2d.drawDebugPose(spriter_pose_next, atlas_data);
      }
    }

    if (gl) {
      var gl_color = render_webgl.gl_color;
      gl_color[3] = alpha;

      var gl_projection = render_webgl.gl_projection;
      mat4x4Identity(gl_projection);
      mat4x4Ortho(gl_projection, -gl.canvas.width / 2, gl.canvas.width / 2, -gl.canvas.height / 2, gl.canvas.height / 2, -1, 1);
	  //mat4x4Ortho(gl_projection, -absolute_x, -absolute_x+gl.canvas.width, -absolute_y, -absolute_y+gl.canvas.height, -1, 1);
	  
	  mat4x4Translate(gl_projection, -(gl.canvas.width / 2-gl.canvas.width*enemy_pos_x), (gl.canvas.height / 2-gl.canvas.height*enemy_pos_y+file.shift_y), 0);

      if (enable_render_ctx2d && enable_render_webgl) {
        mat4x4Translate(gl_projection, gl.canvas.width / 4, 0, 0);
      }

      mat4x4Translate(gl_projection, -camera_x, -camera_y, 0);
      mat4x4Scale(gl_projection, camera_zoom*file.scale, camera_zoom*file.scale, camera_zoom*file.scale);

      if (enable_render_webgl) {
        render_webgl.drawPose(spriter_pose, atlas_data);
        //mat4x4Translate(gl_projection, 0, -10, 0);
        //render_webgl.drawPose(spriter_pose_next, atlas_data);
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
