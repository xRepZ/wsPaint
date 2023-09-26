


export default {
    async connect(roomCode: string) {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
            //const ws = new WebSocket("ws://todo.my/api/ws")
            const ws = new WebSocket("wss://drawingwss.freemyip.com/api/ws")
            ws.onopen = () => {
                console.log(roomCode)
               
                ws.send(JSON.stringify({
                    type: 'init',
                    payload: roomCode
                }))
                resolve(ws)
            }
            ws.onerror = reject
        })
        return {
            send: (type: string, payload: unknown) => {
                ws.send(JSON.stringify({
                    type,
                    payload
                }))
            },
            onmessage: (handler: (data: unknown) => void) => {
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data)
                    handler(data)
                }
            },
            onerror: (handler: (data: unknown) => void) => {
                ws.onerror = handler
            },
            onclose: (handler: (data: unknown) => void) => {
                ws.onclose = handler
            },
            close: () => {
                ws.close()
            }
        }
    }
}
