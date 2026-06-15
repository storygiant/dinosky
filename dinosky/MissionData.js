import { t } from './i18n.js';

// Apply translated text fields onto a mission object at read-time.
// Called by MissionManager whenever it accesses mission text.
export function translateMission(mission) {
    if (!mission) return mission;
    const key = mission.id?.replace(/-/g, '_');
    const titleKey = `${key}_title`;
    const descKey = `${key}_description`;
    const calloutKey = `${key}_callout`;
    const objFailKey = `${key}_objects_fail`;
    return {
        ...mission,
        title: t(titleKey) !== titleKey ? t(titleKey) : mission.title,
        description: t(descKey) !== descKey ? t(descKey) : mission.description,
        objectsFailDescription: t(objFailKey) !== objFailKey ? t(objFailKey) : mission.objectsFailDescription,
        callout: mission.callout ? {
            ...mission.callout,
            text: t(calloutKey) !== calloutKey ? t(calloutKey) : mission.callout.text
        } : mission.callout
    };
}

export const MISSION_LEVELS = {
    level_00: './gfx/levels/level1.json',
//    level_00: './gfx/levels/level4_double_repeat.json',
//    level_01: './gfx/levels/level1.json'
};

export const MISSIONS = [       
/*
    // ========================================================================
    // EXAMPLE MISSIONS WITH TIMELINE SEQUENCES
    // ========================================================================
    // These examples show how to use the optional Timeline animation system.
    // Missions without startSequence/endSequence work exactly as before.
    // ========================================================================        
    {
        id: 'mission_000',
        level: 'level_00',
        type: 'DELIVER_OBJECT_TO_ZONE',
        title: 'MISSION',
        description: 'Put the statue back on the pedestal',
        iconObjectType: 'statue',
//        commercialBreak: false,
        // Callout marker shown above the MissionCalloutObject in the world.
        callout: {
            icon: 'statue',

            text: 'Return the statue!'
        },
        // After completing this mission, auto-offer the next one.
        nextMission: 'mission_001',
        coinReward: 10,
        requireGrounded: true, // Optional: require the dino to be landed on the ground to start this mission
        // Replay rules: can replay after 5 minutes, up to 3 times total.
        replay: { cooldownSeconds: 300, maxReplays: 3 },
        // Dino must land and stop in this zone to start the mission.
        //disabledButtons: ['fire', 'speed'],
        completeDelaySeconds: .2,
        // Optional: Play cinematic sequence before gameplay starts
        // Input is locked during playback, then unlocked for gameplay
		startSequence: {
            duration: 13,
            tracks: [
                {
                    type: 'CameraTrack',
                    keyframes: [
                        { time: 0, tx: 2680, ty: 4300, zoom: 2, ry: 4, ease: 'easeInOut' },
                        { time: 3.5, tx: 2780, ty: 4300, zoom: 3, ease: 'easeInOut' },
                        //{ time: 3.8, tx: 2780, ty: 4300, zoom: 3.6, ease: 'easeInOut' },
                        { time: 7, tx: 2780, ty: 4300, zoom: 3.8, ease: 'easeInOut' },
                        { time: 8, tx: 3200, ty: 3890, zoom: 1, ease: 'easeInOut' },
                        { time: 9, tx: 3200, ty: 3890, zoom: 1, ease: 'easeInOut' },
                        { time: 10.5, tx: 6200, ty: 4300, zoom: 1, ease: 'easeInOut' },
                        { time: 11.5, tx: 6200, ty: 4300, zoom: 1, ease: 'easeInOut' },
                        { time: 12.5, tx: 2850, ty: 4200, zoom: 1, ry: 0, ease: 'easeInOut' },
						
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'boss1',
                    keyframes: [
                        { time: 0, tx: 45305, ty: 705, ry:1.5, visible: true },
                       // { time: 3, x: 0, y: 40 }
                    ]
                },
                {
                    type: 'AnimationTrack',
                    actor: 'boss1',
                    keyframes: [
                        { time: 0, animation: 'idle-loop' },
                        { time: 4.5, animation: 'guard-loop', loop: false },
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0,tx: 2800, ty: 4305, ry: Math.PI*.5, visible: true, hideNodes: ['girl']  },
//                        { time: 1, flame: true, fireAngle: -20 },
//                        { time: 4, flame: true, fireAngle: 10 },
//                        { time: 5, flame: false }
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, tx:2550, ty:4322, ry: 4, z: 25.5, visible: true },
                        { time: 2.5, tx:2747, ty:4322, ry: 4.5, z: 25.5, visible: true },
                        { time: 4.9, tx:2747, ty:4322, ry: 4.5, z: 25.5, visible: true },
                        { time: 5, tx:2747, ty:4322, ry: 4.5, z: 25.5, visible: true },
                        { time: 11, tx:2747, ty:4322, ry: 4, z: 25.5, visible: true },
                    ]
                },   
                {
                    type: 'AnimationTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, animation: 'run-loop', loop: true },
                        { time: 2.5, animation: 'hug', loop: false },
                        { time: 11, animation: 'idle-loop', loop: true },
                    ]
                },				
                {
                    type: 'AnimationTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0, animation: 'idle' },
                        { time: 1.2, animation: 'hugged', loop: false },
                        { time: 4, animation: 'hugmission', loop: false },						
                    ]
                },
                {
                    type: 'EventTrack',
                    keyframes: [
                        { time: 4, callback: (ctx) => console.log('[Timeline] Dino is ready!') }
                    ]
                },
                {
                    type: 'SfxTrack',
                    keyframes: [
                        { time: .5, sfx: 'yay', volume: 0.8  },
                        { time: 2.7, sfx: 'giggle', volume: 0.8  },
                        { time: 1.5, sfx: 'growl2', volume: 0.8  },
                        { time: 4.3, sfx: 'hmm', volume: 0.8  },
                        //{ time: 5.1, sfx: 'growl', volume: 0.8  },
                        { time: 6, sfx: 'uh', volume: 0.8  }
                    ]
                }
            ]
        },
        
        params: {
            objectType: 'statue',
            requiredCount: 1,
            zoneId: 'pedestal',
                    actorIds: ['girl1','boss1'] // Optional: additional actors to control in the timeline (beyond the default "dino" player reference)
        }
    },

    {
        id: 'mission_001',
        level: 'level_00',
        type: 'FLY_TO_ZONE',
        title: 'MISSION',
        description: 'Fly to the top of the highest tree',
        iconObjectType: 'treetop',
        // Callout marker for the world-space icon above the MissionCalloutObject.
        callout: {
            icon: 'treetop',

            text: 'Fly to the treetop!'
        },
        coinReward: 5,
        requireGrounded: true, // Optional: require the dino to be landed on the ground to start this mission
        // Requires mission_000 to be completed first.
        missionDependencies: ['mission_000'],
        nextMission: 'mission_destroy_boss',
        // Replay cooldown of 10 minutes, no total-replay limit.
        replay: { cooldownSeconds: 600 },
        // Dino must land and stop in this zone to start the mission.     
        startSequence: {
            duration: 13,
            tracks: [
                {
                    type: 'CameraTrack',
                    keyframes: [
                        { time: 0, tx: 6780, ty: 1750, zoom: 1.5, ease: 'easeInOut' },
                        { time: 1, tx: 6780, ty: 1750, zoom: 1.5, ease: 'easeInOut' },
                        { time: 1.01, tx: 2780, ty: 4300, zoom: 1.5, ease: 'easeInOut' },
                        { time: 4.2, tx: 2780, ty: 4300, zoom: 3.5, ease: 'easeInOut' },							
                        { time: 4.21, tx: 6780, ty: 1750, zoom: 3.5, ease: 'easeInOut' },
                        { time: 5.99, tx: 6780, ty: 1750, zoom: 3.5, ease: 'easeInOut' },	
                        { time: 6, tx: 2780, ty: 4300, zoom: 3, ease: 'easeInOut' },
                        { time: 9, tx: 2780, ty: 4300, zoom: 2, ease: 'easeInOut' },
                        { time: 10, tx: 3927, ty: 214, zoom: .7, ease: 'easeInOut' },
                        { time: 11, tx: 3927, ty: 214, zoom: .7, ease: 'easeInOut' },		
                        { time: 12, tx: 2780, ty: 4300, zoom: 1, ease: 'easeInOut' },						
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'bossdino1',
                    keyframes: [
                        { time: 0, tx: 6820, ty: 1765, ry:2, visible: true},//, flame: true },
						{ time: 9, tx: 6820, ty: 1765, ry:2, visible: true },
						{ time: 10, tx: 45305, ty: 705, ry:2, visible: true },
                       // { time: 3, x: 0, y: 40 }
                    ]
                },
                {
                    type: 'AnimationTrack',
                    actor: 'bossdino1',
                    keyframes: [
                        { time: 0, animation: 'idle-loop' },
                        { time: 3.2, animation: 'gander', loop: false },
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0, tx: 2850, ty: 4150, ry:Math.PI*.4, visible: true },
						{ time: 2, tx: 2800, ty: 4305, ry: Math.PI*.5, visible: true, ease: 'easeInOut' },
						{ time: 5.2, tx: 2800, ty: 4305, ry: Math.PI*.5, visible: true, ease: 'easeInOut' },
						{ time: 5.5, tx: 2750, ty: 4305, ry: Math.PI*1.5, visible: true, ease: 'easeInOut' },
						{ time: 11.9, showNodes: ['girl'] },						
                       // { time: 3, x: 0, y: 40 }
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, tx:2747, ty:4322, ry: 4.5, z: 25.5, visible: true },
                        { time: 5.2, tx:2747, ty:4322, ry: 4.5, z: 25.5, visible: true },
                        { time: 5.3, tx:2757, ty:4305, ry: 4.5, z: 26.7, visible: true },
                        { time: 6.5, tx:2757, ty:4300, ry: 4.5, z: 26.7, visible: true },
                        { time: 7.8, tx:2757, ty:4300, ry: 4.5, z: 26.7, visible: true },
                        { time: 8.5, tx:2755, ty:4293, ry: 4.5, z: 26.7, visible: true },
                        { time: 11.9, tx:2755, ty:4293, ry: 4.5, z: 26.7, visible: false },
                    ]
                },   
                {
                    type: 'AnimationTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, animation: 'jump_joy', loop: true },
                        { time: 1, animation: 'mission', loop: true },
                        { time: 2.5, animation: 'hug', loop: true },
                        { time: 4.2, animation: 'mount', loop: false },
                    ]
                },				
                {
                    type: 'AnimationTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0, animation: 'hover_turn_left-loop', loop:true },
                        { time: 1.6, animation: 'hugged'},
                        { time: 5.7, animation: 'hugmission', loop: false },
                    ]
                },
                {
                    type: 'EventTrack',
                    keyframes: [
                        { time: 4, callback: (ctx) => console.log('[Timeline] Dino is ready!') }
                    ]
                },
                {
                    type: 'SfxTrack',
                    keyframes: [
                        { time: 1, sfx: 'giggle2', volume: 0.8  },
                        { time: 4.3, sfx: 'growl', volume: 0.8  },
                        { time: 8, sfx: 'woohoo', volume: 0.8  },
                    ]
                }
            ]
        },

       endSequence: {
            duration: 15,
            tracks: [
                {
                    type: 'CameraTrack',
                    keyframes: [
                        { time: 0, tx: 3927, ty: 70, zoom: 1.8, ease: 'easeInOut' },	
                        { time: 1.501, tx: 3927, ty: 70, zoom: 1.9, ease: 'easeInOut' },							
                        { time: 1.502, tx: 6770, ty: 450, zoom: 1.8, ease: 'easeInOut' },		
                        { time: 3, tx: 5870, ty: 450, zoom: 2, ease: 'easeInOut' },
                        { time: 3.011, tx: 5870, ty: 450, zoom: 2, ease: 'easeInOut' },								
                        { time: 3.012, tx: 3927, ty: 70, zoom: 2, ease: 'easeInOut' },
                       // { time: 4, tx: 3927, ty: 70, zoom: 2.5, ease: 'easeInOut' },
						{ time: 5, tx: 3927, ty: 70, zoom: 3.5, ease: 'easeInOut' },
						{ time: 5.01, tx: 3927, ty: 70, zoom: 1.5, ease: 'easeInOut' },
						{ time: 5.99, tx: 3927, ty: 90, zoom: 1.5, ease: 'easeInOut' },
						{ time: 6, tx: 3727, ty: 360, zoom: 2.5, ease: 'easeInOut' },	
						{ time: 8.1, tx: 3727, ty: 390, zoom: 2.5, ease: 'easeInOut' },
                        { time: 8.11, tx: 5870, ty: 390, zoom: 1.8, ease: 'easeInOut' },
                        { time: 9.6, tx: 6770, ty: 450, zoom: 1.8, ease: 'easeInOut' },
                        { time: 9.61, tx: 3927, ty: 70, zoom: 2, ease: 'easeInOut' },
                        { time: 11.6, tx: 3927, ty: 70, zoom: 2.5, ease: 'easeInOut' },
                        { time: 11.61, tx: 7768, ty: -77, zoom: 1.8, ease: 'easeInOut' },
                        { time: 12, tx: 7768, ty: -77, zoom: 1.8, ease: 'easeInOut' },
                        { time: 14.1, tx: 8068, ty: -77, zoom: 1.5, ease: 'easeInOut' },
                        { time: 14.9, tx: 3927, ty: 70, zoom: 1, ease: 'easeInOut' },							
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'bossdino1',
                    keyframes: [
                        { time: 0, tx: 6770, ty: 450, ry:2, visible: true },
                        { time: 1.5, tx: 6770, ty: 450, ry:1.5, visible: true },
                        { time: 3, tx: 5870, ty: 450, ry:1.5, visible: true },
                        { time: 5.01, tx: 4527, ty: 70, ry:1.5, z: 10, visible: true },
                        { time: 6, tx: 3027, ty: 70, ry:1.5, z: 10, visible: true },
                        { time: 7.1, tx: 3027, ty: 70, ry:1.5, z: 10, visible: true },
                        { time: 7.11, tx: 3000, ty: 420, ry:-1.5, z: 10, visible: true },
                        { time: 8.1, tx: 4600, ty: 420, ry:-1.5, z: 10, visible: true },
                        { time: 8.11, tx: 5870, ty: 450, ry:-1.5, visible: true },
                        { time: 9.6, tx: 6770, ty: 450, ry:-1.5, visible: true },
                        { time: 10, tx: 6820, ty: 1765, ry:-1.5, visible: true },
                        { time: 11.6, tx: 7568, ty: -77, ry:-1.5, visible: true },
                        { time: 14.8, tx: 8368, ty: -77, ry:-1.5, visible: true },
                        { time: 14.2, tx: 24000, ty: 3800, ry:-1.5, visible: true },
                        { time: 14.8, tx: 24000, ty: 3800, ry:-1.5, visible: true },
                        { time: 14.9, tx: 45305, ty: 705, ry:1.5, visible: true },
                    ]
                },
                {
                    type: 'AnimationTrack',
                    actor: 'bossdino1',
                    keyframes: [
                        { time: 0, animation: 'z_flyinghard', loop: true },
                        { time: 8.11, animation: 'flying_glide-loop', loop: true },
                        { time: 9.6, animation: 'z_flyinghard', loop: true },
                        { time: 14.3, animation: 'idle-loop', loop: true },
                        { time: 14.9, animation: 'gander', loop: false },
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0, tx: 3927, ty: 70, rx: Math.PI*2, ry: Math.PI*1, visible: true },
                        { time: 1, tx: 3927, ty: 70, rx: Math.PI*2, ry: Math.PI*.5, visible: true },
                        { time: 3.5, tx: 3927, ty: 70, ry: Math.PI*.5, visible: true },
                        { time: 4.5, tx: 3927, ty: 70, ry: Math.PI*.8, visible: true },
                        { time: 5.4, tx: 3927, ty: 70, rx: Math.PI*2, ry: Math.PI*.8, visible: true },
						{ time: 5.41, hideNodes: ['girl'] },
                        { time: 6, tx: 3827, ty: 90, rx: Math.PI*.5, ry: Math.PI*.8, visible: true },
                        { time: 6.1, tx: 3927, ty: 70, rx: Math.PI*2, ry: Math.PI*-.8, visible: true },
                        { time: 7, tx: 3927, ty: 70, rx: Math.PI*2, ry: Math.PI*-.5, visible: true },
                       // { time: 3, x: 0, y: 40 }
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, tx: 0, ty: 100, rx: 0, ry: 1, visible: true },
                        { time: 5.49, tx: 0, ty: 100, rx: 0, ry: 1, visible: true },
                        { time: 5.5, tx: 3827, ty: 100, rx: 0, ry: 1, visible: true },
                        { time: 7.5, tx: 3700, ty: 400, rx: -8, ry: 1, visible: true },
						{ time: 7.51, tx: 3700, ty: 600, rx: 0, ry: 1, visible: false },
						{ time: 8.1, tx: 3700, ty: 600, rx: 0, ry: 1, visible: false },
                        { time: 8.11, tx: 5955, ty: 440, ry:-1.5, visible: true },
                        { time: 9.6, tx: 6855, ty: 440, ry:-1.5, visible: true },
                        { time: 10, tx: 6880, ty: 1765, ry:-1.5, visible: true },
                        { time: 11.6, tx: 7653, ty: -97, ry:-1.5, visible: true },
                        { time: 14.8, tx: 8453, ty: -97, ry:-1.5, visible: true },
                        { time: 14.1, tx: 8453, ty: -87, ry:-1.5, visible: false },
                        { time: 14.8, tx: 8453, ty: -87, ry:-1.5, visible: false },
                        { time: 14.9, tx: 45605, ty: 705, ry:1.5, visible: true },
                    ]
                },   
                {
                    type: 'AnimationTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, animation: 'z_falling', loop: true },
                        { time: 8, animation: 'grab_back-loop', loop: true },
                        { time: 14.9, animation: 'jump_joy', loop: true },
                    ]
                },				
                {
                    type: 'AnimationTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0, animation: 'hover_turn_right-loop', loop: false },
                        { time: 1.2, animation: 'z_hoverhit', loop: false },
                        { time: 2, animation: 'z_hoverhit', loop: false },
                        { time: 5.4, animation: 'z_hoverhit', loop: false },
                        { time: 9.6, animation: 'z_hoverangry', loop: false },								
                    ]
                },
                {
                    type: 'EventTrack',
                    keyframes: [
                        { time: 4, callback: (ctx) => console.log('[Timeline] Dino is ready!') }
                    ]
                },
                {
                    type: 'SfxTrack',
                    keyframes: [
                        { time: .2, sfx: 'giggle', volume: 0.8  },
                        { time: 1.2, sfx: 'growl', volume: 0.8  },
                        { time: 5.1, sfx: 'roar', volume: 0.8  },
                        { time: 5.8, sfx: 'gasp', volume: 0.8  },
                        { time: 7, sfx: 'dinoLiftoff', volume: 0.8  },
                        { time: 7.7, sfx: 'scream', volume: 1  },
                        { time: 10.2, sfx: 'roar2', volume: 0.8  },
                    ]
                }
            ]
        },

        params: {
            zoneDuration: 1,
            zoneId: 'garage',
            actorIds: ['girl1','bossdino1'] // Optional: additional actors to control in the timeline (beyond the default "dino" player reference)
        }
    },   
    {
        id: 'mission_destroy_boss',
        level: 'level_00',
        type: 'DESTROY',
        backgroundMission: true,
        missionDependencies: ['mission_000', 'mission_001'],
		endSequence: {
            duration: 15.5,
            tracks: [
                {
                    type: 'CameraTrack',
                    keyframes: [
                        { time: 0, tx: 45155, ty: 705, zoom: 1.5, ry: 4, ease: 'easeInOut' },	
                        { time: 2.49, tx: 45155, ty: 705, zoom: 1.8, ry: 4, ease: 'easeInOut' },	
                        { time: 2.5, tx: 45155, ty: 905, zoom: .6, ry: 4, ease: 'easeInOut' },
                        { time: 3.8, tx: 45155, ty: 905, zoom: .6, ry: 4, ease: 'easeInOut' },
                        { time: 3.81, tx: 45255, ty: 695, zoom: 2, ry: 4, ease: 'easeInOut' },
                        { time: 5.8, tx: 45255, ty: 695, zoom: 2, ry: 4, ease: 'easeInOut' },
                        { time: 5.81, tx: 44805, ty: 3495, zoom: 2, ry: 4, ease: 'easeInOut' },	
                        { time: 8.80, tx: 44805, ty: 3475, zoom: 2.5, ry: 4, ease: 'easeInOut' },	
                        { time: 8.81, tx: 45255, ty: 695, zoom: 2, ry: 4, ease: 'easeInOut' },		
                        { time: 12, tx: 45255, ty: 695, zoom: 2, ry: 4, ease: 'easeInOut' },	
                        { time: 12.01, tx: 44505, ty: 3225, zoom: 1, ry: 4, ease: 'easeInOut' },		
                        { time: 14.21, tx: 44205, ty: 3225, zoom: 1, ry: 4, ease: 'easeInOut' },
                        { time: 15.5, tx: 45155, ty: 705, zoom: 1.5, ry: 4, ease: 'easeInOut' },							
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'bossdino1',
                    keyframes: [
                        { time: 0, tx: 45305, ty: 705, ry:1.5, rx:0, rz:0, visible: true },
                        { time: 1.1, tx: 45305, ty: 705, ry:1.5, rx:0, rz:0,visible: true },
                        { time: 2.0, tx: 45235, ty: 705, ry:0, rx:0, rz:0, visible: true },
                        { time: 2.5, tx: 45205, ty: 905, ry:0, rx:-1.5, rz:2,visible: true },
						{ time: 3.8, tx: 45205, ty: 1305, ry:0, rx:-1.5, rz:2,visible: true },
						{ time: 5.7, tx: 44805, ty: 3495, ry:1.5, rx:0, rz:0,visible: true },
						{ time: 10.99, tx: 44805, ty: 3495, ry:1.5, rx:0, rz:0,visible: true },
						{ time: 11, tx: 44905, ty: 3295, ry:1.5, rx:0, rz:0,visible: true },
						{ time: 14.5, tx: 44205, ty: 3295, ry:1.5, rx:0, rz:0,visible: true },
						{ time: 14.6, tx: 48205, ty: 3295, ry:1.5, rx:0, rz:0,visible: false },
                       // { time: 3, x: 0, y: 40 }
                    ]
                },
                {
                    type: 'AnimationTrack',
                    actor: 'bossdino1',
                    keyframes: [
                        { time: 0, animation: 'guard-loop' },
                        { time: 1.2, animation: 'dead', loop: false },
                        { time: 2.3, animation: 'deadfall', loop: false },
                        { time: 3.8, animation: 'revive', loop: false },
                        { time: 11, animation: 'z_flyinghard', loop: true },
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0,tx: 45045, ty: 655, ry: Math.PI*-.5, visible: true },
//                        { time: 1, flame: true, fireAngle: -20 },
//                        { time: 4, flame: true, fireAngle: 10 },
						{ time: .1, flame: true, fireAngle: 0 },
                        { time: 1,tx: 45085, ty: 705 },
                        { time: 1.5, flame: false, fireAngle: 0 },
                        { time: 2.5,tx: 45085, ty: 705, ry: Math.PI*-.5},
                        { time: 3.8,tx: 45245, ty: 688, ry: Math.PI*-.5, visible: true },
                        { time: 5.79,tx: 45245, ty: 688, ry: Math.PI*-.5, visible: true },
                        { time: 5.8,tx: 45245, ty: 688, ry: Math.PI*.5, visible: true },
                        { time: 12.5,tx: 45245, ty: 688, ry: Math.PI*.5, showNodes: ['girl'], visible: true },
                    ]
                },
                {
                    type: 'ActorTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 2.5, tx: 45505, ty: 705, ry:1.5, rx:0, rz:0, sx:-1, visible: true },
                        { time: 4.8, tx: 45299, ty: 705, ry:1.5, rx:0, rz:0, visible: true },
                        { time: 5, tx: 45297, ty: 705, ry:1.5, rx:0, rz:0, ry:2.0, z:26.7, visible: true },
                        { time: 8.6, tx: 45297, ty: 705, ry:1.5, rx:0, ry:1.5, z:25.8, visible: true },
                        { time: 8.7, tx: 45235, ty: 689, ry:1.5, rx:0, visible: true },
                        { time: 9.8, tx: 45235, ty: 683, ry:1.5, rx:0, visible: true },
                        { time: 10.9, tx: 45235, ty: 683, ry:1.5, rx:0, visible: true },
						{ time: 11.6, tx: 45238, ty: 676, ry:1.5, rx:0, visible: true },
						{ time: 13, tx: 45238, ty: 676, ry:1.5, rx:0, sx:-1, visible: true },
						{ time: 13.1, tx: 45238, ty: 676, ry:1.5, rx:0, sx:1, visible: false },
                    ]
                },   
                {
                    type: 'AnimationTrack',
                    actor: 'girl1',
                    keyframes: [
                        { time: 0, animation: 'run-loop', loop: true },
                        { time: 4.8, animation: 'hug', loop: true },
                        { time: 8.8, animation: 'mount', loop: true },
                    ]
                },				
                {
                    type: 'AnimationTrack',
                    actor: 'dino',
                    keyframes: [
                        { time: 0, animation: 'z_hoverhit', loop:false },	
                        { time: 2.5, animation: 'z_hoverhit', loop:true },
                        { time: 3.8, animation: 'hugged', loop:true },	
                        { time: 8.8, animation: 'hugmission', loop:true },								
                    ]
                },
                {
                    type: 'EventTrack',
                    keyframes: [
                        { time: 4, callback: (ctx) => console.log('[Timeline] Dino is ready!') }
                    ]
                },
                {
                    type: 'SfxTrack',
                    keyframes: [
                        { time: .2, sfx: 'flameLoop', volume: 0.8  },
                        { time: 1.3, sfx: 'dinoHit', volume: 0.8  },
                        { time: 3.4, sfx: 'growl2', volume: 0.5  },
                        { time: 3.8, sfx: 'yay', volume: 0.8  },
                        { time: 4.7, sfx: 'giggle', volume: 0.8  },
                        { time: 7.5, sfx: 'growl', volume: 0.8  },
                        { time: 11, sfx: 'woohoo', volume: 0.8  }
                    ]
                }
            ]
        },
        
        params: {
			actorIds: ['girl1','bossdino1'], 
			targets: ['bossdino1'],  // sourceObjectName(s) from Tiled
            noExplode: true     // true = freeze at health=0, no explosion
        }
    },
    {
        id: 'mission_statues',
        level: 'level_00',
        type: 'DELIVER_OBJECT_TO_ZONE',
        title: 'MISSION',
        description: 'hidden mission: Repair the statues!',
        coinReward: 50,
        backgroundMission: true,        
        completeDelaySeconds: .6,       
        params: {
            objectNames: ['statuewarrior1', 'statue2'],
            requiredCount: 1,
            zoneIds: ['head1', 'head2'],
        }
    },        
    {
        id: 'mission_003',
        level: 'level_00',
        type: 'PLACE_OBJECT_ON_TARGET',
        title: 'MISSION',
        description: 'Place one car on a roof',
        objectsFailDescription: 'Not enough cars in the level to complete this mission.',
        coinReward: 5,
        iconObjectType: 'car',
        requireGrounded: true, // Optional: require the dino to be landed on the ground to start this mission
        callout: {
            icon: 'car',

            text: 'Place one car on a roof!'
        },
        params: {
            objectType: 'car',
            targetType: 'roof',
            requiredCount: 1
        }
    },
    {
        id: 'mission_race_01',
        level: 'level_00',
        type: 'RACE',
        title: 'RACE',
        description: 'Fly through all the rings as fast as you can!',
        iconObjectType: 'ring',
        requireGrounded: false,   
        callout: {
            icon: 'ring',
            text: 'Race through the rings!'
        },
        replay: { enabled: true, cooldownSeconds: 10 },
        visibleDuringMission: ['ring4', 'ring5', 'ring6', 'ring7', 'ring8', 'ring9', 'ring10', 'ring11', 'ring12', 'ring13'],
        params: {
            // List of Tiled object names for rings, in order they must be passed
            rings: ['ring1', 'ring2', 'ring3', 'ring4', 'ring5', 'ring6', 'ring7', 'ring8', 'ring9', 'ring10', 'ring11', 'ring12', 'ring13'],
        }
    },
    {
        id: 'mission_race_02',
        level: 'level_00',
        type: 'RACE',
        title: 'RACE',
        description: 'Fly through all the rings as fast as you can!',
        iconObjectType: 'ring',
		visibleDuringMission: ['ring2_1', 'ring2_2', 'ring2_3', 'ring2_4', 'ring2_5'],
        requireGrounded: false,   
        callout: {
            icon: 'ring',
            text: 'Race through the rings!'
        },
        replay: { enabled: true, cooldownSeconds: 3 },
        params: {
            // List of Tiled object names for rings, in order they must be passed
            rings: ['ring2_1', 'ring2_2', 'ring2_3', 'ring2_4', 'ring2_5'],
        }
    },
    {
        id: 'mission_race_03',
        level: 'level_00',
        type: 'RACE',
        title: 'RACE',
        description: 'Fly through all the rings as fast as you can!',
        iconObjectType: 'ring',
		visibleDuringMission: ['w_ring1', 'w_ring2', 'w_ring3', 'w_ring4', 'w_ring5', 'w_ring6', 'w_ring7', 'w_ring8', 'w_ring9', 'w_ring10', 'w_ring11', 'w_ring12', 'w_ring13'],
        requireGrounded: false,   
//        cameraPreview: true,
//        cameraPreviewContinuous: true,
//        cameraPreviewSpeed: 120,
//        cameraPreviewZoom: 6,   // zoom out 80% during the preview pan
        raceTrailVisible: true,
        raceRollingVisibilityAhead: 3,
        raceRollingVisibilityBehind: 2,
        callout: {
            icon: 'ring',
            text: 'Race through the rings!'
        },
        replay: { enabled: true, cooldownSeconds: 3 },
        params: {
            // List of Tiled object names for rings, in order they must be passed
            rings: ['w_ring1', 'w_ring2', 'w_ring3', 'w_ring4', 'w_ring5', 'w_ring6', 'w_ring7', 'w_ring8', 'w_ring9', 'w_ring10', 'w_ring11', 'w_ring12', 'w_ring13', 'w_ring1'],
        }
    },
    // Timed destroy missions use the same timer and leaderboard flow as races.
    // Add a matching mission callout / landing zone object in Tiled using this mission id.
    {
        id: 'mission_destroy_tanks_01',
        level: 'level_00',
        type: 'DESTROY_TIMED',
        title: 'MISSION',
        description: 'Destroy 2 tanks as fast as you can!',
        iconObjectType: 'tank',
        requireGrounded: false,
        duration: 600,
        replay: { enabled: true, cooldownSeconds: 10 },
        callout: {
            icon: 'tank',
            text: 'Destroy 2 tanks!'
        },
        params: {
            objectType: 'tank',
            requiredCount: 2
        }
    },
    {
        id: 'mission_destroy_planes_01',
        level: 'level_00',
        type: 'DESTROY_TIMED',
        title: 'MISSION',
        description: 'Destroy 2 planes as fast as you can!',
        iconObjectType: 'plane',
        requireGrounded: false,
        duration: 600,
        replay: { enabled: true, cooldownSeconds: 10 },
        callout: {
            icon: 'plane',
            text: 'Destroy 2 planes!'
        },
        params: {
            objectType: 'plane',
            requiredCount: 2
        }
    },
   {
        id: 'mission_shark',
        level: 'level_00',
        type: 'DELIVER_OBJECT_TO_ZONE',
        title: 'MISSION',
        description: 'Put shark in thank',
        iconObjectType: 'shark',
        // Callout marker shown above the MissionCalloutObject in the world.
        callout: {
            icon: 'statue',            
        },
        // After completing this mission, auto-offer the next one.
        coinReward: 30,
        requireGrounded: false, // Optional: require the dino to be landed on the ground to start this mission
        // Replay rules: can replay after 5 minutes, up to 3 times total.
        replay: { cooldownSeconds: 300, maxReplays: 3 },
        // Dino must land and stop in this zone to start the mission.
        //disabledButtons: ['fire', 'speed'],
        completeDelaySeconds: .2,
        // Optional: Play cinematic sequence before gameplay starts
        // Input is locked during playback, then unlocked for gameplay
        
        params: {
            objectType: 'shark',
            requiredCount: 1,
            zoneId: 'sharktank',
        }
    },
    {
        id: 'mission_cows',
        level: 'level_00',
        type: 'DELIVER_OBJECT_TO_ZONE',
        title: 'MISSION',
        description: 'Bring back 4 cows',
        iconObjectType: 'cow',
        // Callout marker shown above the MissionCalloutObject in the world.
        callout: {
            icon: 'cow',            
        },
        // After completing this mission, auto-offer the next one.
        coinReward: 50,
        requireGrounded: false, // Optional: require the dino to be landed on the ground to start this mission
        // Replay rules: can replay after 5 minutes, up to 3 times total.
        replay: { cooldownSeconds: 300, maxReplays: 3 },
        // Dino must land and stop in this zone to start the mission.
        //disabledButtons: ['fire', 'speed'],
        completeDelaySeconds: .2,
        // Optional: Play cinematic sequence before gameplay starts
        // Input is locked during playback, then unlocked for gameplay
        
        params: {
            objectType: 'cow',
            requiredCount: 4,
            zoneId: 'cowpasture',
        }
    },
    {
        id: 'mission_prison',
        level: 'level_00',
        type: 'DELIVER_OBJECT_TO_ZONE',
        title: 'MISSION',
        description: 'Put 3 people in prison',
        iconObjectType: 'male',
        // Callout marker shown above the MissionCalloutObject in the world.
        callout: {
            icon: 'male',            
        },
        // After completing this mission, auto-offer the next one.
        coinReward: 20,
        requireGrounded: false, // Optional: require the dino to be landed on the ground to start this mission
        // Replay rules: can replay after 5 minutes, up to 3 times total.
        replay: { cooldownSeconds: 300, maxReplays: 3 },
        // Dino must land and stop in this zone to start the mission.
        //disabledButtons: ['fire', 'speed'],
        completeDelaySeconds: .2,
        // Optional: Play cinematic sequence before gameplay starts
        // Input is locked during playback, then unlocked for gameplay
        
        params: {
            objectTypes: ['male', 'suit'],
            requiredCount: 3,
            zoneId: 'prison',
        }
    },
/*
    {
        id: 'mission_002',
        level: 'level_00',
        type: 'FLY_TO_ZONE',
        title: 'MISSION',
        description: 'Follow the other dino',
        iconObjectType: 'bossdino',
        completeDelaySeconds: .2,
        // Optional: Play cinematic sequence before gameplay starts
        // Input is locked during playback, then unlocked for gameplay

        
        params: {
            zoneDuration: 1,
            zoneId: 'exit',
            actorIds: ['girl1','bossdino1'] // Optional: additional actors to control in the timeline (beyond the default "dino" player reference)
        }
    },           
    {
        id: 'mission_003',
        level: 'level_00',
        type: 'PLACE_OBJECT_ON_TARGET',
        title: 'MISSION',
        description: 'Place one car on a roof',
        objectsFailDescription: 'Not enough cars in the level to complete this mission.',        
        iconObjectType: 'car',
        params: {
            objectType: 'car',
            targetType: 'roof',
            requiredCount: 1
        }
    },
    {
        id: 'mission_004',
        level: 'level_00',
        type: 'DELIVER_OBJECT_TO_ZONE',
        title: 'MISSION',
        description: 'Bring one car to your lair',
        objectsFailDescription: 'Not enough cars in the level to complete this mission.',        
        iconObjectType: 'car',
        params: {
            objectType: 'car',
            zoneId: 'lair',
            requiredCount: 1
        }
    },
    {
        id: 'mission_005',
        level: 'level_00',
        type: 'FLY_TO_ZONE',
        title: 'MISSION',
        description: 'Fly to the lookout',
        iconObjectType: 'statue',
        params: {
            zoneId: 'roof_01',
            zoneDuration: 2
        }
    }
*/        
/*    
    {
        id: 'mission_000',
        level: 'level_00',
        type: 'DRAG_OBJECT_FOR_DURATION',
        duration: 120,
        title: 'MISSION',
        description: 'Drag one car for 5 seconds',
        iconObjectType: 'car',
        params: {
            objectType: 'car',
            requiredCount: 1,
            duration: 5
        }
    },
    {
        id: 'mission_001',
        level: 'level_00',
        type: 'LIFT_OBJECT_FOR_DURATION',
        duration: 120,
        title: 'MISSION',
        description: 'Hold one car in the air for 10 seconds',
        iconObjectType: 'car',
        params: {
            objectType: 'car',
            requiredCount: 1,
            duration: 10
        }
    }
*/
];

// Fallback mission zones keep early missions testable before matching MissionZone objects
// are authored in Tiled. Tiled zones with the same ids/types take priority automatically.
export const FALLBACK_MISSION_ZONES = {
    level_01: [
        {
            zoneId: 'roof_01',
            zoneType: 'roof',
            left: -36,
            right: 56,
            bottom: 18,
            top: 28
        },
        {
            zoneId: 'lair',
            zoneType: 'lair',
            left: -48,
            right: 44,
            bottom: -8,
            top: 20
        }
    ]
};

// Tuning Notes
// - mission.duration is currently a timer value only; timeout failure behavior is left as a TODO.
// - Tune zone rectangles generously at first, then shrink them once object placement feels good.
// - Mission dialogs wait for a button press; completed flow can later add auto-continue timing.
// - Rewards/coins intentionally do not exist here yet. Add them as optional mission metadata later.

