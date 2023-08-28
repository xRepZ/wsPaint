<template>
  <div class="flex">
    <div class="ml-10" v-if="roomCode">
      <RouterLink :to="{ path: roomCode }">Room</RouterLink>
    </div>
    <div class="ml-10">Ссылка: {{ roomCode }}</div>
    <button class="ml-10" @click="getCode()">Создать комнату</button>
  </div>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import api from './api/api.ts'
import { ref } from 'vue'

const roomCode = ref('')

const getCode = async () => {
  const str = await api.createRoom()
  roomCode.value = `/draw/${str}`
  console.log(roomCode.value)
}
</script>

<style>


.flex {
  display: flex;
}
.ml-10 {
  margin-left: 10px;
}
</style>