/* eslint-disable */

export function workerFunction() {
    //@ts-ignore
    importScripts(location.origin + '/corto/corto.js', location.origin + '/corto/rangeFetcher.js');
    const activeDataLoadsLimit = 1;
    const minRangeSize = 2000000;
    var self = this;
    let _meshFilePath;
    let currentKeyframe = 0;
    let fetchLoop;
    let lastRequestedKeyframe = -1;
    let _idOfLastKeyFrame;
    let _fileHeader;
    function startFetching({ meshFilePath, numberOfKeyframes, fileHeader }) {
        //@ts-ignore
        let rangeFetcher = new HttpRangeFetcher({});
        console.log("Range fetcher");
        console.log(rangeFetcher);
        _meshFilePath = meshFilePath;
        _idOfLastKeyFrame = numberOfKeyframes - 1;
        _fileHeader = fileHeader;
        self.postMessage({ type: "initialized", numberOfKeyframes });
        let activeDataLoads = 0;
        fetchLoop = setInterval(() => {
            if (lastRequestedKeyframe >= _idOfLastKeyFrame) {
                clearInterval(fetchLoop);
                self.postMessage({ type: "completed" });
                console.log('loading complete');
                return;
            }
            if (activeDataLoads >= activeDataLoadsLimit) {
                return;
            }

            console.log('ADDING LOAD', activeDataLoads, activeDataLoadsLimit);
            activeDataLoads++;

            // TODO: this block loading code depends on assumption that frames lay subsequently inside file
            /**
             *
             * @type {{frameNumber:number,keyframeNumber:number,start:number,end:number,length:number}[]}
             */
            const loadingFrames = [];
            let loadingBlockLength = 0;
            do {
                console.log('combining frames', lastRequestedKeyframe, loadingBlockLength);
                // Now increment one more
                lastRequestedKeyframe++;
                // This is our new keyframe
                const newKeyframe = lastRequestedKeyframe;
                const keyframe = _fileHeader.frameData[newKeyframe];
                // console.log('loading frame', newKeyframe, ' / ', _fileHeader.frameData.length);
                if (keyframe === undefined)
                    return console.log("Keyframe undefined", newKeyframe);
                //console.log("Keyframe is", fileHeader.frameData[newKeyframe]);
                // Get count of frames associated with keyframe
                const iframes = _fileHeader.frameData.filter(frame => frame.keyframeNumber === newKeyframe && frame.keyframeNumber !== frame.frameNumber).sort((a, b) => (a.frameNumber < b.frameNumber));
                const requestStartBytePosition = keyframe.startBytePosition;
                const requestByteLength = iframes.length > 0 ?
                  iframes[iframes.length - 1].startBytePosition + iframes[iframes.length - 1].meshLength - requestStartBytePosition
                  : keyframe.startBytePosition + keyframe.meshLength - requestStartBytePosition;

                loadingFrames.push({
                    frameNumber: keyframe.frameNumber,
                    keyframeNumber: keyframe.keyframeNumber,
                    start: requestStartBytePosition,
                    end: requestStartBytePosition + requestByteLength,
                    length: requestByteLength
                });
                console.log('start/end/length', requestStartBytePosition, requestByteLength, keyframe.meshLength);
                loadingBlockLength += requestByteLength;
            } while (loadingBlockLength < minRangeSize || lastRequestedKeyframe >= _idOfLastKeyFrame)

            console.log('loading frames from', loadingFrames, loadingFrames.length);
            loadAndDecodeFrames(rangeFetcher, loadingFrames).then(() => {
                console.log('block loading ended !!!')
                activeDataLoads--;
            });

        }, 1000 / 60);
    }
    self.onmessage = function (e) {
        console.log('Received input: ', e.data); // message received from main thread
        if (e.data.type === 'initialize')
            startFetching(e.data.payload);
    };

    /**
     *
     * @param {HttpRangeFetcher} rangeFetcher
     * @param {{frameNumber:number,keyframeNumber:number,start:number,end:number,length:number}[]} loadingFrames
     * @return Promise
     */
    function loadAndDecodeFrames(rangeFetcher, loadingFrames) {
        const rangeStart = loadingFrames[0].start;
        const rangeEnd = loadingFrames[loadingFrames.length-1].end;
        const rangeLength = rangeEnd - rangeStart;

        console.log('loadAndDecodeFrames', rangeStart, rangeEnd, rangeLength);

        return new Promise(resolve => {
            rangeFetcher.getRange(_meshFilePath, rangeStart, rangeLength).then(response => {
                console.log('getRange done');
                loadingFrames.forEach((frame) => {
                    // Slice keyframe out by byte position
                    const inBufferPosition = frame.start - rangeStart;
                    const keyframeEndPosition = frame.end - rangeStart;
                    console.log('decoding from', inBufferPosition, frame.length);
                    // console.log("Mesh length: ", keyframe.meshLength);
                    //console.log("Response is", response);

                    // response.buffer.buffer.subarray(inBufferPosition, frame.length)

                    //@ts-ignore
                    let decoder = new CortoDecoder(response.buffer.buffer, inBufferPosition, frame.length);
                    let keyframeMeshData = decoder.decode();
                    ////////////////////
                    // Slice data from returned response and decode
                    ////////////////////
                    // decode corto data and create a temp buffer geometry
                    const bufferObject = {
                        frameNumber: frame.frameNumber,
                        keyframeNumber: frame.keyframeNumber,
                        bufferGeometry: keyframeMeshData
                    };
                    const message = {
                        keyframeBufferObject: bufferObject,
                    };
                    // // For each iframe...
                    // for (const frameNo in iframes) {
                    //   const iframe = iframes[frameNo];
                    //   console.log("iframe is", iframes[frameNo]);
                    //   const frameStartPosition = iframe.startBytePosition - requestStartBytePosition;
                    //   const frameEndPosition = iframe.meshLength + frameStartPosition;
                    //   console.log("frame start position: ", frameStartPosition, "frame end position:", frameEndPosition);
                    //   // Slice iframe out, decode into list of position vectors
                    //   //@ts-ignore
                    //   let decoder = new CortoDecoder(response, frameStartPosition, frameEndPosition);
                    //   let meshData = decoder.decode();
                    //   let geometry = new BufferGeometry();
                    //   geometry.setIndex(
                    //     new Uint32BufferAttribute(keyframeMeshData.index, 1)
                    //   );
                    //   geometry.setAttribute(
                    //     'position',
                    //     new Float32BufferAttribute(meshData.position, 3)
                    //   );
                    //   geometry.setAttribute(
                    //     'uv',
                    //     new Float32BufferAttribute(keyframeMeshData.uv, 2)
                    //   );
                    //   console.log("Iframe meshData is", meshData);
                    //   console.log("Decoded iframe", frameNo, "meshData is", meshData);
                    //   // Check if iframe position is in ring buffer -- if so, update it, otherwise set it
                    //   // decode corto data and create a temp buffer geometry
                    //   const bufferObject: IFrameBuffer = {
                    //     frameNumber: iframe.frameNumber,
                    //     keyframeNumber: iframe.keyframeNumber,
                    //     vertexBuffer: geometry
                    //   };
                    //   message.iframeBufferObjects.push(bufferObject);
                    // }
                    // console.log('frame', newKeyframe, 'loaded');
                    console.log('frame', frame.frameNumber, 'loaded', message);
                    self.postMessage({ type: 'framedata', payload: message });
                });
                resolve();
            });
        })
    }
}
//# sourceMappingURL=workerFunction.js.map
