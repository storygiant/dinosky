/**
 * TIMELINE SYSTEM - PRACTICAL EXAMPLES & BEST PRACTICES
 * 
 * This file demonstrates how to use the Timeline animation system for missions.
 * 
 * ============================================================================
 * KEY PRINCIPLES
 * ============================================================================
 * 
 * 1. OPTIONAL BY DEFAULT
 *    - Missions without startSequence/endSequence: behave exactly as before
 *    - No performance cost when not using timelines
 *    - Can mix timeline and non-timeline missions in same game
 * 
 * 2. INPUT LOCKING
 *    - Input is locked ONLY while timeline plays
 *    - Prevents player interaction during cinematics
 *    - Automatically restored when timeline ends
 * 
 * 3. SELF-CONTAINED
 *    - Timeline system doesn't interfere with gameplay
 *    - Only active when explicitly started
 *    - Safe to ignore if not using cinematics
 * 
 * 4. TIMING IS RELATIVE
 *    - Keyframe times are relative to timeline start (0.0 to duration)
 *    - Timeline updates via game loop's delta time
 *    - All interpolation is linear
 * 
 * ============================================================================
 * EXAMPLE 1: MISSION WITHOUT SEQUENCES (BASELINE)
 * ============================================================================
 * 
 * This is how missions work with NO timeline involvement.
 * Timelines are completely optional.
 */

const basicMission = {
    id: 'mission_basic',
    level: 'level_00',
    type: 'DRAG_OBJECT_FOR_DURATION',
    duration: 120,
    title: 'Simple Mission',
    description: 'Just do the thing',
    iconObjectType: 'car',
    
    // No startSequence, no endSequence
    // Timeline system does nothing, mission plays normally
    
    params: {
        objectType: 'car',
        requiredCount: 1,
        duration: 5
    }
};

/**
 * ============================================================================
 * EXAMPLE 2: CAMERA ZOOM-IN INTRO
 * ============================================================================
 * 
 * Show the player the level by zooming the camera in from far away.
 * Cinematic way to reveal the level layout.
 */

const cameraPanMission = {
    id: 'mission_camera_pan',
    level: 'level_00',
    type: 'LIFT_OBJECT_FOR_DURATION',
    duration: 120,
    title: 'Hold The Object',
    description: 'Keep a car in the air for 10 seconds',
    iconObjectType: 'car',
    
    startSequence: {
        duration: 3,
        tracks: [
            {
                type: 'CameraTrack',
                keyframes: [
                    // Start zoomed out, far from center
                    { time: 0, x: -20, y: 5, zoom: 0.5 },
                    // Pan toward center while zooming in
                    { time: 1.5, x: -10, y: 2, zoom: 1.0 },
                    // End at ideal gameplay position
                    { time: 3, x: 0, y: 0, zoom: 1.5 }
                ]
            }
        ]
    },
    
    params: {
        objectType: 'car',
        requiredCount: 1,
        duration: 10
    }
};

/**
 * ============================================================================
 * EXAMPLE 3: DRAGON ENTRANCE ANIMATION
 * ============================================================================
 * 
 * Play an animation on the dragon as part of the cinematic intro.
 */

const dragonEntranceMission = {
    id: 'mission_dragon_entrance',
    level: 'level_00',
    type: 'PLACE_OBJECT_ON_TARGET',
    duration: 120,
    title: 'Deliver The Object',
    description: 'Place an object in the target zone',
    iconObjectType: 'car',
    
    startSequence: {
        duration: 3,
        tracks: [
            // Camera reveals the dragon approaching
            {
                type: 'CameraTrack',
                keyframes: [
                    { time: 0, x: -15, y: 0, zoom: 1.0 },
                    { time: 3, x: 0, y: 0, zoom: 1.5 }
                ]
            },
            // Dragon flies in from the left
            {
                type: 'ActorTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, x: -30, y: 10 },
                    { time: 1.5, x: -10, y: 5 },
                    { time: 3, x: 0, y: 0 }
                ]
            },
            // Dragon animations during approach
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, animation: 'flying', loop: true },
                    { time: 2.5, animation: 'landing', loop: false }
                ]
            },
            // Trigger effects at specific times
            {
                type: 'EventTrack',
                keyframes: [
                    { time: 0, callback: (ctx) => console.log('Dragon appears!') },
                    { time: 1.5, callback: (ctx) => console.log('Dragon approaching...') },
                    { time: 3, callback: (ctx) => console.log('Dragon landed!') }
                ]
            }
        ]
    },
    
    params: {
        objectType: 'car',
        targetType: 'target_zone'
    }
};

/**
 * ============================================================================
 * EXAMPLE 4: VICTORY ANIMATION
 * ============================================================================
 * 
 * Play a celebration animation when the mission completes.
 */

const victoryAnimationMission = {
    id: 'mission_victory',
    level: 'level_00',
    type: 'DRAG_OBJECT_FOR_DURATION',
    duration: 120,
    title: 'Drag Challenge',
    description: 'Drag a car for 5 seconds',
    iconObjectType: 'car',
    
    // No startSequence - gameplay begins immediately
    
    endSequence: {
        duration: 2.5,
        tracks: [
            // Dragon celebrates
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    // Play victory animation immediately when mission ends
                    { time: 0, animation: 'victory', loop: false }
                ]
            },
            // Camera zooms out as dragon celebrates
            {
                type: 'CameraTrack',
                keyframes: [
                    { time: 0, zoom: 1.5 },
                    { time: 1, zoom: 1.2 },
                    { time: 2.5, zoom: 1.0 }
                ]
            },
            // Play victory sound effect
            {
                type: 'EventTrack',
                keyframes: [
                    { time: 0, callback: (ctx) => {
                        console.log('Victory!');
                        // Could trigger sound: AudioManager.playSound('victory.ogg')
                    }},
                    { time: 1, callback: (ctx) => console.log('Mission complete animation running...') }
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
 * EXAMPLE 5: FULL CINEMATIC EXPERIENCE
 * ============================================================================
 * 
 * Complete cinematic package: intro + gameplay + outro
 */

const fullCinematicMission = {
    id: 'mission_cinematic',
    level: 'level_00',
    type: 'LIFT_OBJECT_FOR_DURATION',
    duration: 120,
    title: 'Cinematic Challenge',
    description: 'A mission with full cinematic framing',
    iconObjectType: 'car',
    
    // INTRO: Establish mood and guide player attention
    startSequence: {
        duration: 4,
        tracks: [
            // Start far away - "hero shot"
            {
                type: 'CameraTrack',
                keyframes: [
                    { time: 0, x: 0, y: 10, zoom: 0.6 },
                    { time: 2, x: 0, y: 5, zoom: 1.0 },
                    { time: 4, x: 0, y: 0, zoom: 1.5 }
                ]
            },
            // Dragon enters from off-screen left
            {
                type: 'ActorTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, x: -40, y: 15 },
                    { time: 2, x: -15, y: 8 },
                    { time: 4, x: 0, y: 0 }
                ]
            },
            // Smooth animation sequence
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, animation: 'idle' },
                    { time: 0.5, animation: 'takeoff', loop: false },
                    { time: 1.5, animation: 'flying', loop: true },
                    { time: 3.5, animation: 'landing', loop: false }
                ]
            },
            // Dramatic beats
            {
                type: 'EventTrack',
                keyframes: [
                    { time: 0, callback: (ctx) => console.log('📺 Cinematic begins...') },
                    { time: 2, callback: (ctx) => console.log('✈️ Dragon takes flight!') },
                    { time: 4, callback: (ctx) => console.log('🎬 Ready for action!') }
                ]
            }
        ]
    },
    
    // OUTRO: Celebrate accomplishment
    endSequence: {
        duration: 3,
        tracks: [
            // Dragon does a barrel roll or spin
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    { time: 0, animation: 'victory' }
                ]
            },
            // Camera pulls back and rotates
            {
                type: 'CameraTrack',
                keyframes: [
                    { time: 0, x: 0, y: 0, zoom: 1.5 },
                    { time: 1.5, x: 0, y: 3, zoom: 1.2 },
                    { time: 3, x: 0, y: 5, zoom: 1.0 }
                ]
            },
            // Finale
            {
                type: 'EventTrack',
                keyframes: [
                    { time: 0, callback: (ctx) => console.log('🎉 Victory animation starts!') },
                    { time: 3, callback: (ctx) => console.log('🏆 Mission cinematic complete!') }
                ]
            }
        ]
    },
    
    params: {
        objectType: 'car',
        requiredCount: 1,
        duration: 10
    }
};

/**
 * ============================================================================
 * EXAMPLE 6: TIMING AND INTERPOLATION
 * ============================================================================
 * 
 * Detailed example showing how timing and interpolation work.
 */

const timingExample = {
    id: 'mission_timing_demo',
    level: 'level_00',
    type: 'DRAG_OBJECT_FOR_DURATION',
    duration: 60,
    title: 'Timing Example',
    description: 'Watch interpolation in action',
    iconObjectType: 'car',
    
    startSequence: {
        // Timeline lasts 5 seconds
        duration: 5,
        tracks: [
            {
                type: 'CameraTrack',
                keyframes: [
                    // At time 0.0 seconds: camera at (0, 0) zoom 1.0
                    { time: 0.0, x: 0, y: 0, zoom: 1.0 },
                    // At time 2.5 seconds: camera at (10, 5) zoom 1.5
                    { time: 2.5, x: 10, y: 5, zoom: 1.5 },
                    // At time 5.0 seconds: camera at (20, 10) zoom 2.0
                    { time: 5.0, x: 20, y: 10, zoom: 2.0 }
                    // Note: Values between keyframes are smoothly interpolated
                    // At time 1.25s: x≈5, y≈2.5, zoom≈1.25 (halfway between keyframe 0 and 1)
                ]
            },
            {
                type: 'AnimationTrack',
                actor: 'dragon',
                keyframes: [
                    // Discrete animations (no interpolation, just timing)
                    { time: 0, animation: 'idle' },
                    { time: 1, animation: 'takeoff', loop: false },
                    { time: 2, animation: 'flying', loop: true },
                    { time: 4, animation: 'landing', loop: false }
                    // Animations trigger ONCE when timeline reaches their time
                ]
            },
            {
                type: 'EventTrack',
                keyframes: [
                    // Events fire ONCE at their scheduled time
                    { time: 0.5, callback: (ctx) => console.log('Event at 0.5s') },
                    { time: 2.5, callback: (ctx) => console.log('Event at 2.5s') },
                    { time: 5.0, callback: (ctx) => console.log('Timeline finished!') }
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
 * BEST PRACTICES
 * ============================================================================
 * 
 * 1. KEYFRAME ORDERING
 *    ✅ DO: Keep keyframe times in ascending order
 *    const good = [
 *        { time: 0, x: 0 },
 *        { time: 1, x: 5 },
 *        { time: 2, x: 10 }
 *    ];
 *    
 *    ❌ DON'T: Mix up times
 *    const bad = [
 *        { time: 0, x: 0 },
 *        { time: 2, x: 10 },  // Wrong order!
 *        { time: 1, x: 5 }
 *    ];
 * 
 * 2. ANIMATION TIMING
 *    ✅ DO: Plan animation duration carefully
 *    If 'takeoff' animation is 1 second, schedule 'flying' at time ≥ 1
 *    
 *    ❌ DON'T: Schedule animations too close together
 *    It's hard for animations to transition if times overlap
 * 
 * 3. CAMERA BOUNDS
 *    Remember: camera x, y are in world space
 *    If your level is 40 units wide, camera x should stay within range
 *    Zoom 1.0 = normal, < 1.0 = zoomed out, > 1.0 = zoomed in
 * 
 * 4. ACTOR REFERENCES
 *    Use clear, consistent actor IDs
 *    'dragon' is reserved for game.player
 *    Other objects use their mission IDs or object IDs
 * 
 * 5. EVENT CALLBACKS
 *    Events can trigger sound, particles, or other effects
 *    Keep callbacks short - long operations block the game loop
 *    Use for: sfx, visual fx, logging, state changes (not heavy computation)
 * 
 * 6. TEST WITHOUT SEQUENCES
 *    Always test missions with sequences DISABLED first
 *    Verify mission logic works independently
 *    Then add sequences for polish
 * 
 * 7. FALLBACK BEHAVIOR
 *    If sequence is missing or malformed:
 *    - Timeline creation fails gracefully
 *    - Mission continues normally
 *    - Console warning is logged
 *    - No crash or data loss
 * 
 * ============================================================================
 * DEBUGGING CHECKLIST
 * ============================================================================
 * 
 * Timeline not playing?
 *   □ Check mission.startSequence / mission.endSequence exists
 *   □ Check sequence.duration > 0
 *   □ Check sequence.tracks array is not empty
 *   □ Look for console errors/warnings
 * 
 * Animation not triggering?
 *   □ Verify actor ID matches (should be 'dragon' for player)
 *   □ Check animation name is correct
 *   □ Ensure dragon.playAnimation() method exists
 *   □ Verify keyframe time is within timeline.duration
 * 
 * Camera not moving?
 *   □ Check camera object exists in context
 *   □ Verify camera has position.x, position.y, zoom properties
 *   □ Ensure keyframes have x, y, zoom values (not all required)
 *   □ Check zoom value is reasonable (0.5-3.0 typical range)
 * 
 * Input locked too long?
 *   □ Verify timeline.duration matches actual animation length
 *   □ Check for errors in event callbacks blocking progression
 *   □ Ensure timeline plays to completion (no infinite loops)
 * 
 * ============================================================================
 * PERFORMANCE NOTES
 * ============================================================================
 * 
 * Timeline overhead is minimal:
 * - Each track has O(n) update where n = number of keyframes
 * - Typical mission might have 2-4 tracks
 * - Each track typically has 3-8 keyframes
 * - Total update cost: < 1ms for typical mission
 * 
 * Optimization tips:
 * - Limit keyframes per track to necessary points
 * - Combine related changes into single track when possible
 * - Events should not perform expensive operations
 * - Use discrete animations instead of position changes for complex movement
 * 
 * ============================================================================
 */

// Export examples for reference
export const TIMELINE_EXAMPLES = {
    basicMission,
    cameraPanMission,
    dragonEntranceMission,
    victoryAnimationMission,
    fullCinematicMission,
    timingExample
};
