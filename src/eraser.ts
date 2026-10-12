import type { Artwork, Point } from './model';
function distance(p: Point, a: Point, b: Point): number {
  const dx=b.x-a.x, dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function cross(a:Point,b:Point,c:Point) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function near(a:Point,b:Point,c:Point,d:Point,r:number) {
  const intersection=cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0;
  return intersection || Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<=r;
}
// Work in screen pixels so finger-sized hit areas stay consistent on phones.
export function hitsEraser(item: Artwork, start: Point, end: Point, radius: number, sx:number, sy:number):boolean {
  const screen=(p:Point)=>({x:p.x*sx,y:p.y*sy});
  const a=screen(start),b=screen(end);
  if (item.kind==='sticker') {
    const center=screen(item);
    const dx=50*sx,dy=50*sy;
    if ([a,b].some(p=>Math.abs(p.x-center.x)<=dx+radius && Math.abs(p.y-center.y)<=dy+radius)) return true;
    const corners=[{x:center.x-dx,y:center.y-dy},{x:center.x+dx,y:center.y-dy},{x:center.x+dx,y:center.y+dy},{x:center.x-dx,y:center.y+dy}];
    return corners.some((p,i)=>near(a,b,p,corners[(i+1)%4],radius));
  }
  const points=item.points.map(screen),r=radius+item.width*Math.max(sx,sy)/2;
  return points.some((p,i)=>near(a,b,p,points[Math.max(0,i-1)],r));
}
