<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.1" name="dt2" tilewidth="128" tileheight="64" tilecount="3" columns="0">
 <grid orientation="orthogonal" width="1" height="1"/>
 <tile id="0">
  <properties>
   <property name="fake" type="bool" value="true"/>
  </properties>
  <image source="../tiled/examples/sticker-knight/map/earthWall.png" width="64" height="64"/>
 </tile>
 <tile id="1">
  <properties>
   <property name="rmove" type="bool" value="true"/>
   <property name="solid" type="bool" value="true"/>
  </properties>
  <image source="../tiled/examples/sticker-knight/map/earthWall2.png" width="64" height="64"/>
 </tile>
 <tile id="2">
  <properties>
   <property name="death" type="bool" value="true"/>
   <property name="rmove" type="bool" value="true"/>
  </properties>
  <image source="../tiled/examples/sticker-knight/map/trap.png" width="128" height="32"/>
 </tile>
</tileset>
