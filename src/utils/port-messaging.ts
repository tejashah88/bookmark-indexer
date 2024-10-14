import { useEffect, useRef, useState } from 'react';

import type { PlasmoMessaging, PortsMetadata } from '@plasmohq/messaging';
import { listen as portListen } from '@plasmohq/messaging/port';

export function generatePortHelperMethods<
  RequestBody = any,
  ResponseBody = any
>(
  req: PlasmoMessaging.Request<keyof PortsMetadata, RequestBody>,
  res: PlasmoMessaging.Response<ResponseBody>
) {
  function attemptResponseSend(body: ResponseBody) {
    try {
      res.send(body);
    } catch (sendError) {
      console.warn(
        'Unable to send progress update to popup, which is most likely closed.'
      );
      console.warn(sendError);
    }
  }

  return [attemptResponseSend];
}

// export const usePort: PlasmoMessaging.PortHook = (name) => {
//   const portRef = useRef<chrome.runtime.Port>();
//   const reconnectRef = useRef(0);
//   const [data, setData] = useState();

//   chrome.runtime.connect({ name: 'testy' })

//   useEffect(() => {
//     if (!name) {
//       return null;
//     }

//     const { port, disconnect } = portListen(
//       name,
//       (msg) => {
//         setData(msg);
//       },
//       () => {
//         reconnectRef.current = reconnectRef.current + 1;
//       }
//     );

//     portRef.current = port;
//     return disconnect;
//   }, [
//     name,
//     reconnectRef.current // This is needed to force a new port ref
//   ]);

//   return {
//     data,
//     send: (body) => {
//       portRef.current.postMessage({
//         name,
//         body
//       });
//     },
//     listen: (handler) => portListen(name, handler)
//   };
// };
