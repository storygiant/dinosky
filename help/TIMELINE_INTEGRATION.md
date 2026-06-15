/**
 * TIMELINE INTEGRATION WITH MISSIONMANAGER
 * 
 * This document shows how to integrate the Timeline system with MissionManager.
 * 
 * The integration is OPTIONAL - missions without sequences are unaffected.
 * Input locking is only enabled during timeline playback.
 * 
 * ============================================================================
 * MISSION CONFIG EXTENSION
 * ============================================================================
 * 
 * Add optional startSequence and endSequence to mission configs:
 * 
 * {
 *   id: 'mission_001',
 *   level: 'level_00',
 *   type: 'PLACE_OBJECT_ON_TARGET',
 *   duration: 120,
 *   
 *   // Optional: Play sequence before gameplay starts
 *   startSequence: {
 *     duration: 3,
 *     tracks: [ ... ]
 *   },
 *   
 *   // Optional: Play sequence after mission completes
 *   endSequence: {
 *     duration: 2,
 *     tracks: [ ... ]
 *   },
 *   
 *   params: { ... }
 * }
 * 
 * If startSequence or endSequence are null/undefined: skipped (no side effects)
 * 
 * ============================================================================
 * MISSIONMANAGER CODE CHANGES
 * ============================================================================
 * 
 * Add this to the top of MissionManager.js:
 * 
 * import { playTimeline, collectActors } from './Timeline.js';
 * 
 * Add this helper method to MissionManager class:
 * 
 *   async playMissionTimeline(sequence, inputLocked = true) {
 *       // Failsafe: null/undefined sequence is skipped
 *       if (!sequence) return;
 *       
 *       // Lock input during timeline
 *       if (inputLocked) {
 *           this.game?.setMissionInputLocked?.(true);
 *       }
 *       
 *       try {
 *           await playTimeline(sequence, {
 *               camera: this.game?.camera,
 *               actors: collectActors(this.game, ['dragon', ...this.getActiveMissionActorIds()])
 *           });
 *       } catch (error) {
 *           console.error('[Mission] Timeline error:', error);
 *       } finally {
 *           // Restore control
 *           if (inputLocked) {
 *               this.game?.setMissionInputLocked?.(false);
 *           }
 *       }
 *   }
 *   
 *   getActiveMissionActorIds() {
 *       // Return IDs of actors used by current mission
 *       // For simple missions, just return empty array
 *       return [];
 *   }
 * 
 * ============================================================================
 * MISSION START FLOW
 * ============================================================================
 * 
 * In startMissionAt(), after level loads, add:
 * 
 *   async startMissionAt(index) {
 *       const mission = this.missions[index];
 *       if (!mission) { ... }
 *       
 *       this.state = MISSION_STATE.TRANSITIONING;
 *       // ... existing setup code ...
 *       
 *       // Load mission level
 *       await this.game?.loadMissionLevel?.(mission.level);
 *       
 *       // NEW: Play start sequence (input locked during playback)
 *       await this.playMissionTimeline(mission.startSequence, true);
 *       
 *       // Existing code resumes here
 *       this.addFallbackZonesForMissionLevel(mission.level);
 *       this.game?.setMissionTimerProgress?.(this.getTimerProgress());
 *       
 *       // ... rest of existing code ...
 *   }
 * 
 * ============================================================================
 * MISSION COMPLETION FLOW
 * ============================================================================
 * 
 * In completeCurrentMission(), after cleanup, add:
 * 
 *   async completeCurrentMission() {
 *       if (this.completionFlowActive || !this.currentMission) { return; }
 *       
 *       this.completionFlowActive = true;
 *       this.state = MISSION_STATE.COMPLETED;
 *       this.game?.setMissionInputLocked?.(true);
 *       this.game?.setActiveMission?.(null);
 *       this.currentHandler?.cleanup?.(this.currentMission, this.game);
 *       
 *       // NEW: Play end sequence
 *       await this.playMissionTimeline(this.currentMission.endSequence, true);
 *       
 *       // Then show completion dialog
 *       this.state = MISSION_STATE.SHOW_COMPLETED;
 *       await this.dialog.showComplete(this.currentMission);
 *       
 *       // ... rest of existing code ...
 *   }
 * 
 * ============================================================================
 * KEY POINTS
 * ============================================================================
 * 
 * 1. OPTIONAL: Mission without sequences work exactly as before
 *    - playMissionTimeline(null) returns immediately
 *    - No side effects or performance impact
 * 
 * 2. INPUT LOCKING: Only during timeline
 *    - Input is locked while timeline plays
 *    - Restored when timeline finishes or errors
 *    - Prevents player interaction during cinematics
 * 
 * 3. ACTOR REGISTRY: Timeline controls named actors
 *    - 'dragon' maps to game.player
 *    - Other IDs map to level objects
 *    - collectActors() gathers them from game state
 * 
 * 4. FAILURE SAFE: Errors don't crash mission
 *    - Try/catch in playMissionTimeline()
 *    - Always restores input lock
 *    - Logs error for debugging
 * 
 * 5. TIMING: Sequences run before/after key events
 *    - startSequence: After level load, before gameplay
 *    - endSequence: After completion, before dialog
 * 
 * ============================================================================
 * EXAMPLE: MISSION WITH START AND END SEQUENCES
 * ============================================================================
 * 
 * const flyingIntroMission = {
 *   id: 'mission_002',
 *   level: 'level_00',
 *   type: 'PLACE_OBJECT_ON_TARGET',
 *   duration: 120,
 *   
 *   // Dragon flies in from upper left, lands, then gameplay begins
 *   startSequence: {
 *     duration: 3,
 *     tracks: [
 *       {
 *         type: 'CameraTrack',
 *         keyframes: [
 *           { time: 0, x: -10, y: 5, zoom: 1.0 },
 *           { time: 3, x: 0, y: 0, zoom: 1.5 }
 *         ]
 *       },
 *       {
 *         type: 'ActorTrack',
 *         actor: 'dragon',
 *         keyframes: [
 *           { time: 0, x: -20, y: 15 },
 *           { time: 2, x: -5, y: 5 },
 *           { time: 3, x: 0, y: 0 }
 *         ]
 *       },
 *       {
 *         type: 'AnimationTrack',
 *         actor: 'dragon',
 *         keyframes: [
 *           { time: 0, animation: 'flying', loop: true },
 *           { time: 2.5, animation: 'landing' }
 *         ]
 *       },
 *       {
 *         type: 'EventTrack',
 *         keyframes: [
 *           { time: 1, callback: (ctx) => console.log('Dragon entering zone') }
 *         ]
 *       }
 *     ]
 *   },
 *   
 *   // Dragon lifts object, triumphant pose
 *   endSequence: {
 *     duration: 2,
 *     tracks: [
 *       {
 *         type: 'AnimationTrack',
 *         actor: 'dragon',
 *         keyframes: [
 *           { time: 0, animation: 'victory' }
 *         ]
 *       },
 *       {
 *         type: 'CameraTrack',
 *         keyframes: [
 *           { time: 0, zoom: 1.5 },
 *           { time: 2, zoom: 1.0 }
 *         ]
 *       }
 *     ]
 *   },
 *   
 *   params: {
 *     targetZoneId: 'target_zone_1',
 *     objectType: 'CAR'
 *   }
 * }
 * 
 * ============================================================================
 * DEBUGGING
 * ============================================================================
 * 
 * To debug timeline issues:
 * 
 * 1. Check console for Timeline warnings/errors
 * 2. Verify actor IDs match what's in game.levelObjectManager.objects
 * 3. Ensure keyframe times are in ascending order
 * 4. Verify camera object exists and has position, zoom properties
 * 5. Use timeline.getProgress() to check animation state
 * 
 * Performance:
 * - Timelines are only updated when playing
 * - Most missions will have 0-2 sequences (negligible overhead)
 * - Track updates are O(n) where n = number of tracks
 */
