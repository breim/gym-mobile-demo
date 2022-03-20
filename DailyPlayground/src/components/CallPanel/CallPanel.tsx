import React, {
  useEffect,
  useReducer,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { logDailyEvent } from '../../utils';
import { DailyEvent } from '@daily-co/react-native-daily-js';
import {
  callReducer,
  initialCallState,
  PARTICIPANTS_CHANGE,
  CAM_OR_MIC_ERROR,
  FATAL_ERROR,
  isScreenShare,
  isLocal,
  containsScreenShare,
  participantCount,
  getMessage,
} from './callState';
import Tile, { TileType } from '../Tile/Tile';
import CallMessage from '../CallMessage/CallMessage';
import { useCallObject } from '../../useCallObject';
import { TRAY_HEIGHT as TRAY_THICKNESS } from '../Tray/Tray';
import CopyLinkButton from '../CopyLinkButton/CopyLinkButton';
import { useOrientation, Orientation } from '../../useOrientation';

type Props = {
  roomUrl: string;
};

const THUMBNAIL_EDGE_LENGTH = 0;

const CallPanel = (props: Props) => {
  const callObject = useCallObject();
  const [callState, dispatch] = useReducer(callReducer, initialCallState);
  const [usingFrontCamera, setUsingFrontCamera] = useState(true); // default
  const orientation = useOrientation();
  let owner = '';

  /**
   * Start listening for participant changes, when the callObject is set.
   */
  useEffect(() => {
    if (!callObject) {
      return;
    }

    const events: DailyEvent[] = [
      'participant-joined',
      'participant-updated',
      'participant-left',
    ];

    const handleNewParticipantsState = (event?: any) => {
      event && logDailyEvent(event);
      dispatch({
        type: PARTICIPANTS_CHANGE,
        participants: callObject.participants(),
      });
    };

    // Use initial state
    handleNewParticipantsState();

    // Listen for changes in state
    for (const event of events) {
      callObject.on(event, handleNewParticipantsState);
    }

    // Stop listening for changes in state
    return function cleanup() {
      for (const event of events) {
        callObject.off(event, handleNewParticipantsState);
      }
    };
  }, [callObject]);

  /**
   * Start listening for call errors, when the callObject is set.
   */
  useEffect(() => {
    if (!callObject) {
      return;
    }

    function handleCameraErrorEvent(event?: any) {
      logDailyEvent(event);
      dispatch({
        type: CAM_OR_MIC_ERROR,
        message:
          (event && event.errorMsg && event.errorMsg.errorMsg) || 'Unknown',
      });
    }

    // We're making an assumption here: there is no camera error when callObject
    // is first assigned.

    callObject.on('camera-error', handleCameraErrorEvent);

    return function cleanup() {
      callObject.off('camera-error', handleCameraErrorEvent);
    };
  }, [callObject]);

  /**
   * Start listening for fatal errors, when the callObject is set.
   */
  useEffect(() => {
    if (!callObject) {
      return;
    }

    function handleErrorEvent(event?: any) {
      logDailyEvent(event);
      dispatch({
        type: FATAL_ERROR,
        message: (event && event.errorMsg) || 'Unknown',
      });
    }

    // We're making an assumption here: there is no error when callObject is
    // first assigned.

    callObject.on('error', handleErrorEvent);

    return function cleanup() {
      callObject.off('error', handleErrorEvent);
    };
  }, [callObject]);

  /**
   * Toggle between front and rear cameras.
   */
  const flipCamera = useCallback(async () => {
    if (!callObject) {
      return;
    }
    const { device } = await callObject.cycleCamera();
    if (device) {
      setUsingFrontCamera(device.facingMode === 'user');
    }
  }, [callObject]);

  /**
   * Send an app message to the remote participant whose tile was clicked on.
   */
  const sendHello = useCallback(
    (participantId: string) => {
      callObject &&
        callObject.sendAppMessage({ hello: 'world' }, participantId);
    },
    [callObject]
  );

  /**
   * Get lists of large tiles and thumbnail tiles to render.
   */
  const [largeTiles, thumbnailTiles, localTile, hostTile] = useMemo(() => {
    let larges: JSX.Element[] = [];
    let thumbnails: JSX.Element[] = [];
    let local: JSX.Element[] = [];
    let host: JSX.Element[] = [];
    let superHostId = ''

    Object.entries(callObject.participants()).forEach(([id, participant]) => {
      if (participant.owner){
        superHostId = id;
      }
    });

    Object.entries(callState.callItems).forEach(([id, callItem]) => {
      // console.log(callItem)
      let tileType: TileType;
      if (isScreenShare(id)) {
        tileType = TileType.Full;
      } else if (superHostId === id) {
        tileType = TileType.Host;
      } else if (isLocal(id) || containsScreenShare(callState.callItems)) {
        tileType = TileType.Local;
        // } else if (participantCount(callState.callItems) <= 3) {
        //   tileType = TileType.Full;
      } else {
        tileType = TileType.Half;
      }
      const tile = (
        <Tile
          key={id}
          videoTrackState={callItem.videoTrackState}
          audioTrackState={callItem.audioTrackState}
          mirror={usingFrontCamera && isLocal(id)}
          type={tileType}
          robotId={isLocal(id) ? `robots-tile-local` : `robots-tile-${id}`}
          disableAudioIndicators={isScreenShare(id)}
          onPress={
            isLocal(id)
              ? flipCamera
              : () => {
                  sendHello(id);
                }
          }
        />
      );
      if (tileType === TileType.Thumbnail) {
        thumbnails.push(tile);
      } else if (tileType === TileType.Local) {
        local.push(tile);
      } else if (tileType === TileType.Host) {
        host.push(tile);
      } else {
        larges.push(tile);
      }
    });
    return [larges, thumbnails, local, host];
  }, [callState.callItems, flipCamera, sendHello, usingFrontCamera]);

  const message = getMessage(callState, props.roomUrl);
  const showCopyLinkButton = message && !message.isError;

  return (
    <>

      {/* HOST */}
      <View
        style={[
          styles.mainContainer,
          message ? styles.messageContainer : styles.largeTilesContainerOuter,
        ]}
      >
        {message ? (
          <>
            <CallMessage
              header={message.header}
              detail={message.detail}
              isError={message.isError}
            />
            {showCopyLinkButton && <CopyLinkButton roomUrl={props.roomUrl} />}
          </>
        ) : (
          <ScrollView
            alwaysBounceVertical={false}
            alwaysBounceHorizontal={false}
            horizontal={orientation === Orientation.Landscape}
          >
            <View
              style={[
                styles.largeTilesContainerInnerBase,
                orientation === Orientation.Portrait
                  ? styles.largeTilesContainerInnerPortrait
                  : styles.largeTilesContainerInnerLandscape,
              ]}
            >
              {hostTile}
            </View>

            {/* USER LOCAL */}
            <View
              style={[
                styles.largeTilesContainerInnerBase,
                orientation === Orientation.Portrait
                  ? styles.largeTilesContainerInnerPortrait
                  : styles.largeTilesContainerInnerLandscape,
              ]}
            >
              {localTile}
            </View>

            <View style={[styles.mainContainer]}>
              <ScrollView style={styles.exercisesBox}>
                <Text style={styles.exercisesText}>PLANK x 30s</Text>
              </ScrollView>
            </View>

            {/* OTHER USERS IN CALL */}
            <View
              style={[
                styles.largeTilesContainerInnerBase,
                orientation === Orientation.Portrait
                  ? styles.largeTilesContainerInnerPortrait
                  : styles.largeTilesContainerInnerLandscape,
              ]}
            >
              {largeTiles}
            </View>
          </ScrollView>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  exercisesBox: {
    backgroundColor: 'blue',
  },
  exercisesText: {
    color: '#FFF',
    padding: 15,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  thumbnailContainerOuterBase: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  thumbnailContainerOuterPortrait: {
    width: '100%',
    height: THUMBNAIL_EDGE_LENGTH,
    paddingTop: 12,
  },
  thumbnailContainerOuterLandscape: {
    height: '100%',
    width: THUMBNAIL_EDGE_LENGTH,
    paddingLeft: 12,
  },
  localContainerInnerPortrait: {
    marginLeft: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  thumbnailContainerInnerPortrait: {
    marginLeft: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  thumbnailContainerInnerLandscape: {
    marginTop: 12,
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  messageContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  largeTilesContainerOuter: {
    justifyContent: 'center',
  },
  largeTilesContainerInnerBase: {
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  largeTilesContainerInnerPortrait: {
    flexDirection: 'row',
    marginTop: THUMBNAIL_EDGE_LENGTH,
    marginBottom: 0,
  },
  largeTilesContainerInnerLandscape: {
    flexDirection: 'column',
    marginLeft: THUMBNAIL_EDGE_LENGTH,
    marginRight: 0,
  },
});

export default CallPanel;
