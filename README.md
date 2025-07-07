# IsoArcade
A javascript libary for making isometric games. This means that the games use a fixed-angle orthographic projection of 3D space.

To run locally use:
``
python3 -m http.server 8000
``

Ctrl + C to kill

If it does not work use:


``
lsof -i :8000
kill -9 <PID>
``

where PID is replaced of course. 