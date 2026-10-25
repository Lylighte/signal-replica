export const GIF_PROFILES=Object.freeze({
  standard:{label:'标准',fps:12,colors:256,size:'720p'},
  compact:{label:'压缩',fps:8,colors:64,size:'360p'},
  small:{label:'高压缩',fps:6,colors:32,size:'240p'},
  extreme:{label:'极限压缩',fps:4,colors:16,size:'90p'}
});
export const GIF_SIZES=Object.freeze({'720p':720,'540p':540,'360p':360,'240p':240,'144p':144,'90p':90});
export const DEFAULT_GIF_PROFILE='small';
export function gifSettings(profile=DEFAULT_GIF_PROFILE,size){
  if(!Object.hasOwn(GIF_PROFILES,profile))throw new Error('GIF 压缩选项无效。');
  const settings=GIF_PROFILES[profile];size??=settings.size;
  if(!Object.hasOwn(GIF_SIZES,size))throw new Error('GIF 尺寸无效。');
  return{...settings,height:GIF_SIZES[size],size};
}
