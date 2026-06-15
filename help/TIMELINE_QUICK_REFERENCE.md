/**
 * TIMELINE SYSTEM - QUICK REFERENCE
 * 
 * A modular, optional animation system for mission cinematics.
 * 
 * ============================================================================
 * BASIC USAGE
 * ============================================================================
 * 
 * 1. Add to mission config:
 * 
 *    {
 *      id: 'mission_001',
 *      level: 'level_00',
 *      type: 'LIFT_OBJECT_FOR_DURATION',
 *      duration: 120,
 *      
 *      startSequence: { ... },  // Optional: plays after level load
 *      endSequence: { ... },    // Optional: plays after mission completes
 *      
 *      params: { ... }
 *    }
 * 
 * 2. That's it! MissionManager handles the rest.
 * 
 * ============================================================================
 * TRACK TYPES
 * ============================================================================
 * 
 * CameraTrack - Control camera position and zoom
 *   {
 *     type: 'CameraTrack',
 *     keyframes: [
 *       { time: 0, x: 0, y: 0, zoom: 1.5 },
 *       { time: 2, x: 10, y: 5, zoom: 2.0 }
 *     ]
 *   }
 * 
 * ActorTrack - Move an actor, change rotation, toggle visibility
 *   {
 *     type: 'ActorTrack',
 *     actor: 'dragon',  // Actor ID
 *     keyframes: [
 *       { time: 0, x: 0, y: 0, rotation: 0, visible: true },
 *       { time: 2, x: 10, y: 5, rotation: 0.5, visible: true }
 *     ]
 *   }
 * 
 * AnimationTrack - Play animations on actors
 *   {
 *     type: 'AnimationTrack',
 *     actor: 'dragon',
 *     keyframes: [
 *       { time: 0, animation: 'idle' },
 *       { time: 1, animation: 'flying', loop: true },
 *       { time: 3, animation: 'landing', loop: false }
 *     ]
 *   }
 * 
 * EventTrack - Trigger functions at specific times
 *   {
 *     type: 'EventTrack',
 *     keyframes: [
 *       { time: 0.5, callback: (ctx) => console.log('Hello!') },
 *       { time: 2, callback: (ctx) => playSound('sfx/boom.ogg') }
 *     ]
 *   }
 * 
 * ============================================================================
 * ACTOR IDS
 * ============================================================================
 * 
 * Reserved IDs:
 *   'dragon'  →  game.player (the controllable dragon)
 * 
 * Custom IDs:
 *   Any level object can be referenced by its ID
 *   Must be registered when timeline plays
 * 
 * Default context:
 *   Only 'dragon' is automatically available
 *   Other actors must be added to mission.params.actorIds
 * 
 * ============================================================================
 * KEYFRAME FORMAT
 * ============================================================================
 * 
 * All keyframes have a 'time' property (required):
 *   { time: 1.5, ... }
 * 
 * Times are relative to timeline start (0 to sequence.duration)
 * Keep times in ascending order
 * 
 * CameraTrack keyframes:
 *   { time: 0, x: 0, y: 0, zoom: 1.5 }
 *   (All properties optional; only provided properties are updated)
 * 
 * ActorTrack keyframes:
 *   { time: 0, x: 0, y: 0, z: 0, rotation: 0, visible: true }
 *   (All properties optional)
 * 
 * AnimationTrack keyframes:
 *   { time: 0, animation: 'idle', loop: true }
 *   (animation name required; loop defaults to true)
 * 
 * EventTrack keyframes:
 *   { time: 0, callback: (context) => { ... } }
 *   (callback function required; called once when time is reached)
 * 
 * ============================================================================
 * INTERPOLATION
 * ============================================================================
 * 
 * Values between keyframes are linearly interpolated:
 *   Keyframe 1: { time: 0, x: 0 }
 *   Keyframe 2: { time: 2, x: 10 }
 *   At time 1: x = 5 (halfway)
 *   At time 0.5: x = 2.5 (quarter of the way)
 * 
 * Non-numeric values (like animation names) jump at keyframe time:
 *   { time: 0, animation: 'idle' }
 *   { time: 1, animation: 'flying' }
 *   At time 0.5: still playing 'idle'
 *   At time 1.0: switches to 'flying'
 * 
 * ============================================================================
 * COMPLETE EXAMPLE
 * ============================================================================
 */

const exampleMission = {
    id: 'mission_example',
    level: 'level_00',
    type: 'DRAG_OBJECT_FOR_DURATION',
    duration: 120,
    title: 'Cinematic Mission',
    description: 'Watch the intro, do the thing, watch the outro',
    iconObjectType: 'car',
    
    // INTRO: 3 seconds
    startSequence: {
        duration: 3,
        tracks: [
            // Camera pans from left to center while zooming in
            {
                type: 'CameraTrack',
                keyframes: [
                    { time: 0, x: -20, y: 0, zoom: 1.0 },
                    { time: 3, x: 0, y: 0, zoom: 1.5 }
                ]
            },
            // Dragon enters from the left
            {
                type: 'ActorTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, x: -30, y: 5 },
                    { time: 3, x: 0, y: 0 }
                ]
            },
            // Dragon animations
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, animation: 'flying', loop: true },
                    { time: 2.5, animation: 'landing', loop: false }
                ]
            },
            // Trigger events
            {
                type: 'EventTrack',
                keyframes: [
                    { time: 0, callback: (ctx) => console.log('Mission start!') },
                    { time: 3, callback: (ctx) => console.log('Ready to play!') }
                ]
            }
        ]
    },
    
    // OUTRO: 2 seconds (plays after mission completes)
    endSequence: {
        duration: 2,
        tracks: [
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, animation: 'victory' }
                ]
            },
            {
                type: 'CameraTrack',
                keyframes: [
                    { time: 0, zoom: 1.5 },
                    { time: 2, zoom: 1.0 }
                ]
            }
        ]
    },
    
    params: {
        objectType: 'car',
        requiredCount: 1,
        duration: 5
    }
};

/**
 * ============================================================================
 * FLOW DIAGRAM
 * ============================================================================
 * 
 * MISSION START:
 *   1. Level loads
 *   2. IF startSequence exists:
 *      a. Input locked
 *      b. Timeline plays
 *      c. Wait for completion
 *      d. Input unlocked
 *   3. Mission briefing dialog shows
 *   4. Gameplay begins
 * 
 * MISSION COMPLETION:
 *   1. Mission objective achieved
 *   2. Gameplay stops
 *   3. IF endSequence exists:
 *      a. Input locked
 *      b. Timeline plays
 *      c. Wait for completion
 *      d. Input unlocked
 *   4. Completion dialog shows
 *   5. Next mission starts
 * 
 * MISSION WITHOUT SEQUENCES:
 *   [Level loads]
 *   [Dialog shows]
 *   [Gameplay]
 *   [Dialog shows]
 *   [Next mission]
 *   (Timeline system not involved)
 * 
 * ============================================================================
 * INPUT LOCKING BEHAVIOR
 * ============================================================================
 * 
 * While timeline plays:
 *   - Player cannot move dragon
 *   - Player cannot interact with objects
 *   - Player cannot pause (or can, depending on settings)
 *   - Input is completely locked
 * 
 * When timeline finishes:
 *   - Input is automatically restored
 *   - If timeline errors, input is still restored
 *   - No manual unlock needed
 * 
 * Missions without sequences:
 *   - Input is NOT locked by timeline
 *   - Input handling unchanged
 * 
 * ============================================================================
 * COMMON PATTERNS
 * ============================================================================
 * 
 * SIMPLE CAMERA PAN:
 *   startSequence: {
 *     duration: 2,
 *     tracks: [{
 *       type: 'CameraTrack',
 *       keyframes: [
 *         { time: 0, x: -10, y: 0, zoom: 1.0 },
 *         { time: 2, x: 0, y: 0, zoom: 1.5 }
 *       ]
 *     }]
 *   }
 * 
 * ACTOR ENTRANCE:
 *   startSequence: {
 *     duration: 2,
 *     tracks: [{
 *       type: 'ActorTrack',
 *       actor: 'dragon',
 *       keyframes: [
 *         { time: 0, x: -30, y: 0 },
 *         { time: 2, x: 0, y: 0 }
 *       ]
 *     }]
 *   }
 * 
 * ANIMATION SEQUENCE:
 *   startSequence: {
 *     duration: 3,
 *     tracks: [{
 *       type: 'AnimationTrack',
 *       actor: 'dragon',
 *       keyframes: [
 *         { time: 0, animation: 'idle' },
 *         { time: 0.5, animation: 'takeoff', loop: false },
 *         { time: 1, animation: 'flying', loop: true }
 *       ]
 *     }]
 *   }
 * 
 * VICTORY POSE:
 *   endSequence: {
 *     duration: 2,
 *     tracks: [{
 *       type: 'AnimationTrack',
 *       actor: 'dragon',
 *       keyframes: [
 *         { time: 0, animation: 'victory' }
 *       ]
 *     }]
 *   }
 * 
 * ============================================================================
 * TROUBLESHOOTING
 * ============================================================================
 * 
 * "Timeline not playing"
 *   Check: Does mission.startSequence exist? Is duration > 0? Are tracks defined?
 *   Look in console for warnings
 * 
 * "Animation not triggering"
 *   Check: Is actor ID correct? (use 'dragon' for player)
 *   Check: Does actor.playAnimation() method exist?
 *   Check: Is animation name valid?
 * 
 * "Camera not moving"
 *   Check: Does game.camera exist?
 *   Check: Are x, y, zoom values in keyframes?
 *   Check: Are values reasonable? (x/y in world bounds, zoom 0.5-3.0)
 * 
 * "Input locked forever"
 *   Check: Did timeline finish? (check console for errors)
 *   Check: Is timeline.duration correct?
 *   Check: Are there infinite loops in callbacks?
 * 
 * "Keyframes interpolating weirdly"
 *   Check: Are keyframe times in ascending order?
 *   Check: Are values monotonic or does it zigzag?
 *   Remember: interpolation is linear only
 * 
 * ============================================================================
 * DESIGN NOTES
 * ============================================================================
 * 
 * Why optional?
 *   - Missions are complex enough; cinematics are a nice-to-have
 *   - Easier to add later than bake in from the start
 *   - Players might prefer immediate action
 * 
 * Why tracks?
 *   - Modular: each domain (camera, actors, animations, events) is independent
 *   - Extensible: easy to add new track types
 *   - Reusable: same tracks work for different missions
 * 
 * Why linear interpolation?
 *   - Fast: one multiply-add per value per frame
 *   - Predictable: no spline surprises
 *   - Smooth enough: for 60fps animation, linear is imperceptible
 * 
 * Why actors by ID?
 *   - Flexible: works with any object type
 *   - Safe: no hard references, can change objects
 *   - Clear: sequence config shows exactly what's being animated
 * 
 * ============================================================================
 */

export { exampleMission };
