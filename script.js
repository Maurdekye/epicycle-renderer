var $ = document.querySelector.bind(document)

function render_circles(pen, frame, sinusoids) {
  if (sinusoids.length == 0)
    return [0, 0];

  var x = Math.cos(sinusoids[0].frequency * frame + sinusoids[0].phase) * sinusoids[0].amplitude;
  var y = Math.sin(sinusoids[0].frequency * frame + sinusoids[0].phase) * sinusoids[0].amplitude;

  for (var i = 1; i < sinusoids.length; i++) {
    var sinusoid = sinusoids[i];
    pen.beginPath();
    pen.arc(x, y, sinusoid.amplitude, 0, 2*Math.PI);
    pen.moveTo(x, y);
    x += Math.cos(sinusoid.frequency * frame + sinusoid.phase) * sinusoid.amplitude;
    y += Math.sin(sinusoid.frequency * frame + sinusoid.phase) * sinusoid.amplitude;
    pen.lineTo(x, y);
    pen.stroke();
  }

  return [x, y];
}

function discrete_fourier_transform_decomposition(path, n_frequencies=10, normalize_signal=true, discrete_timestep=1) {

  if (path.length <= 1)
    return [[], 0];

  var _path = path.concat([path[0]]);

  var reals, imags, time;

  if (normalize_signal) {
    // reinterpret x and y coordinates into evenly-spaced arrays

    var last = _path[0];
    time = 0;
    var discrete_time = 0;
    var reals = [];
    var imags = [];

    for (var i = 1; i < _path.length; i++) {
      var [lx, ly] = last;
      var next = _path[i];
      var [nx, ny] = next;
      var [dx, dy] = [nx - lx, ny - ly];
      var magnitude = Math.sqrt(dx**2 + dy**2);
      var last_time = time;
      time += magnitude;
      for (; discrete_time < time; discrete_time += discrete_timestep) {
        var delta = (discrete_time - last_time) / (time - last_time);
        reals.push(lx + dx * delta);
        imags.push(ly + dy * delta);
      }
      last = next;
    }
  } else {
    reals = _path.map(t => t[0]);
    imags = _path.map(t => t[1]);
    time = _path.length;
  }

  console.log(reals.length);

  // compute epicycles

  var [freals, fimags] = fourier.dft(reals, imags);
  var sinusoids = [];

  for (var i = 0; i < freals.length; i++) {
    sinusoids.push({
      phase: Math.atan2(fimags[i], freals[i]),
      amplitude: Math.sqrt(freals[i]**2 + fimags[i]**2) / (freals.length),
      frequency: (i < freals.length / 2 ? i : i - freals.length) * Math.PI * 2
    });
  }

  sinusoids.sort((a, b) => b.amplitude - a.amplitude);

  return [sinusoids.slice(0, Math.min(n_frequencies, freals.length)), time];
}

function get_num_frequencies() {
  return Math.round(Math.pow(1000, $("#num-frequencies").value/100));
}

function main() {
  var main_canvas = $('#main-canvas');
  var drawing_canvas = $("#drawing-canvas");
  var pen = main_canvas.getContext('2d');
  var drawpen = drawing_canvas.getContext('2d');
  var dw = drawing_canvas.width;
  var dh = drawing_canvas.height;

  var dragging = false;
  var normalize_signal = $("#normalize-signal").checked;
  var num_frequencies = get_num_frequencies()
  var [x, y] = [0, 0];
  var start_time = performance.now();
  var drawpath = [];
  var renderpath = [];
  var sinusoids = [];
  var pathlength = 0;

  function get_touch_pos(touchev) {
    touchev.preventDefault();
    var touch = touchev.changedTouches[0];
    var nx = touch.clientX - touchev.target.offsetLeft;
    var ny = touch.clientY - touchev.target.offsetTop;
    return [nx, ny];
  }

  function draw_start(nx, ny) {
    drawpen.clearRect(0, 0, dw, dh);
    dragging = true;
    x = nx;
    y = ny;
    drawpath = [[x, y]];
  }
  drawing_canvas.addEventListener('mousedown', e => draw_start(e.offsetX, e.offsetY));
  drawing_canvas.addEventListener('touchstart', e => draw_start(...get_touch_pos(e)));
  
  function draw_end(nx, ny) {
    drawpen.beginPath();
    drawpen.moveTo(nx, ny);
    drawpen.lineTo(drawpath[0][0], drawpath[0][1]);
    drawpen.stroke();
    dragging = false;
    reset_rendered_canvas();
  }
  drawing_canvas.addEventListener('mouseup', e => draw_end(e.offsetX, e.offsetY));
  drawing_canvas.addEventListener('touchend', e => draw_end(...get_touch_pos(e)));

  function draw_drag(nx, ny) {
    if (dragging) {
      drawpen.beginPath();
      drawpen.moveTo(x, y);
      x = nx;
      y = ny;
      drawpen.lineTo(x, y);
      drawpen.stroke();
      drawpath.push([x, y]);
    }
  };
  drawing_canvas.addEventListener('mousemove', e => draw_drag(e.offsetX, e.offsetY));
  drawing_canvas.addEventListener('touchmove', e => draw_drag(...get_touch_pos(e)));

  function clear_draw_canvas() {
    drawpen.clearRect(0, 0, dw, dh);
    drawpath = [];
    reset_rendered_canvas();
  }
  $("#clear-drawing-button").onclick = clear_draw_canvas;


  function reset_rendered_canvas() {
    restart_rendered_canvas();
    [sinusoids, pathlength] = discrete_fourier_transform_decomposition(drawpath, num_frequencies+1, normalize_signal);
  }
  
  function restart_rendered_canvas() {
    renderpath = [];
    start_time = performance.now();
  }
  $("#reset-frequency-image-button").onclick = restart_rendered_canvas;

  // num frequencies slider
  $("#num-frequencies-display").innerHTML = get_num_frequencies();
  $("#num-frequencies").addEventListener('input', e => {
    $("#num-frequencies-display").innerHTML = get_num_frequencies();
  });

  $("#num-frequencies").addEventListener('mouseup', e => {
    num_frequencies = get_num_frequencies();
    reset_rendered_canvas();
  });

  $("#normalize-signal").onclick = () => {
    normalize_signal = $("#normalize-signal").checked;
    reset_rendered_canvas();
  }

  function render_step() {
    var w = main_canvas.width;
    var h = main_canvas.height;
    pen.clearRect(0, 0, w, h);

    var time = (performance.now() - start_time)/pathlength/10;

    pen.strokeStyle = "#AAA";

    renderpath.push(render_circles(pen, time, sinusoids));

    if (renderpath.length > 0) {
      pen.beginPath();
      pen.strokeStyle = "#000";
      pen.moveTo(renderpath[0][0], renderpath[0][1]);
      for (var i = 1; i < renderpath.length; i++) {
        pen.lineTo(renderpath[i][0], renderpath[i][1]);
      }
      pen.stroke();
    }

    window.requestAnimationFrame(render_step);
  }
  window.requestAnimationFrame(render_step);
}

window.onload = main;