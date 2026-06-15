<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.1" name="gameplay" tilewidth="32" tileheight="32" tilecount="64" columns="8">
 <image source="gameplay.webp" width="256" height="256"/>
 <tile id="0" type="SOLID_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="1" type="GROUND_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="2" type="GROUND_SLOPE_UP_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="3" type="GROUND_SLOPE_DOWN_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="4" type="GROUND_NO_TAKEOFF_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="5" type="BREAKABLE">
  <properties>
   <property name="breakable" type="bool" value="true"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="BREAKABLE"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="6" type="EMPTY1_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="7" type="EMPTY2_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="8" type="GROUND_INVISIBLE">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0.9"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0.9"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="9" type="GROUND_SLOPE_DOWN_INVISIBLE">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0.9"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="10" type="GROUND_SLOPE_UP_INVISIBLE">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0.9"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="11" type="TEST6">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="12" type="TUNNEL_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="13" type="TUNNEL_SLOPE_UP_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="14" type="TUNNEL_SLOPE_DOWN_OLD">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="15" type="TEST8">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="16" type="GROUND_INVISIBLE">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0.5"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0.5"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="17" type="TEST10">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="18" type="TEST11">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="19" type="TEST12">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="20" type="TUNNEL_SLOPE_UP">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="21" type="TUNNEL">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="22" type="TUNNEL2">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="23" type="TUNNEL_SLOPE_DOWN">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="24" type="TEST17">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="25" type="TEST18">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="26" type="TEST19">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="27" type="TEST20">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="28" type="TEST21">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="29" type="TEST22">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="30" type="TEST30">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="31" type="TEST31">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="32" type="GROUND_SLOPE_UP">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="33" type="TEST33">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="34" type="GROUND">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="35" type="GROUND_SLOPE_DOWN">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="36" type="TEST36">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="37" type="TEST37">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="38" type="TEST38">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="39" type="TEST39">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="40" type="TEST40">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="41" type="SOLID">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="42" type="TEST42">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="43" type="TEST43">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="44" type="GROUND_SLOPE_END">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="45" type="TEST45">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="EMPTY"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="46" type="TEST46">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="EMPTY"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="47" type="TEST47">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="WATER"/>
   <property name="norender" type="bool" value="true"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="48" type="TEST48">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="49" type="TEST49">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="50" type="TEST50">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="51" type="TEST51">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="52" type="TEST52">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="53" type="GROUND_SLOPE_UP">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="0"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="54" type="GROUND">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="55" type="GROUND_SLOPE_DOWN">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="0"/>
   <property name="gameplayType" value="GROUND"/>
   <property name="startHeight" type="float" value="1.01"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="56" type="TEST56">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="57" type="TEST57">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="58" type="TEST58">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="59" type="TEST59">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="60" type="TEST60">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="61" type="TEST61">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="62" type="TEST62">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="63" type="TEST63">
  <properties>
   <property name="breakable" type="bool" value="false"/>
   <property name="endHeight" type="float" value="1"/>
   <property name="gameplayType" value="SOLID"/>
   <property name="startHeight" type="float" value="1"/>
   <property name="takeoffAllowed" type="bool" value="false"/>
  </properties>
 </tile>
</tileset>
