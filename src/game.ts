import type { RPThresholds } from './types.js';
/** The sole source of rule constants. Verified against FIRST BIOBUZZ TU07, 2026-10-29. */
export const GAME = {
 name:'BIOBUZZ', season:'2026–27', manualVersion:'TU07', verified:'2026-10-30',
 manual:'https://ftc-resources.firstinspires.org/ftc/game/cm-html',
 points:{tip:20,leave:3,park:5,cell:2,flower:2,bottom:5,garden:1,minor:5,major:20},
 rp:{win:3,tie:1,achievement:1},
 thresholds:{swarm:16,pollinator1:4,pollinator2:7} as RPThresholds,
 inventory:{pollen:40,redNectar:8,blueNectar:8},
 limits:{possession:4,flowers:4,autoSeconds:30,teleSeconds:120,transitionSeconds:8,flowerSeconds:60,fieldInches:144,loadingWidth:23,loadingDepth:11,gardenWidth:23,gardenDepth:2},
 qualificationSort:['rankingScore','averageNonFoulScore','averageTips','averageAuto','randomTiebreak'],
} as const;
export const sumElements = (e:{pollen:number;redNectar:number;blueNectar:number}):number => e.pollen+e.redNectar+e.blueNectar;
