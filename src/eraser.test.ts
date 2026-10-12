import {expect,it} from 'vitest';
import {hitsEraser} from './eraser';
import type {Artwork} from './model';
const stroke: Artwork={id:'s',authorId:'me',revision:1,kind:'stroke',width:2,color:'#62635e',points:[{x:100,y:100},{x:200,y:100}]};
it('erases near thin lines without touching their SVG path',()=>{
 expect(hitsEraser(stroke,{x:150,y:112},{x:150,y:112},16,1,1)).toBe(true);
 expect(hitsEraser(stroke,{x:150,y:140},{x:150,y:140},16,1,1)).toBe(false);
});
it('detects crossing during fast drags and uses phone pixel sizes',()=>{
 expect(hitsEraser(stroke,{x:150,y:0},{x:150,y:200},8,1,1)).toBe(true);
 expect(hitsEraser(stroke,{x:150,y:140},{x:150,y:140},16,.3,.3)).toBe(true);
});
