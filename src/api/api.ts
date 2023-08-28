import axios from 'axios';



const simpleRequest = {
    get: async (url: string, options: any) => {
        console.log(options)
        return await axios.get(url, options).then(r => r.data.payload)
    },
    post: async (url: string, data: Object | null) => {
        return await axios.post(url, data).then(r => r.data.payload)
    },
    put: async (url: string, data: Object) => {

        return await axios.put(url, data).then(r => r.data.payload)
    },
    // delete: async (url, options) => {
    //     return await axios.delete(url, options).then(r => r.data.payload)
    // }
}

const api = {
    createRoom: () => {
        return simpleRequest.post('/api/room', {})
    },
    getCanvas: (code: string) => {
        return simpleRequest.get('/api/room', { params: { code } })
    },
    putCanvas: (code: string, canvas: string) => {
        return simpleRequest.put('/api/room', { code, canvas})
    }
    
}

export default api
