<template>
  <div :class="['container fr', !taskList || !taskList.size ? 'ac jc' : 'bg-fff']">
    <a-empty v-if="!taskList || !taskList.size" :image="require('../assets/images/no-data.png')">
      <template #description>
        <span class="text-active" style="font-weight: bold">暂无数据</span>
      </template>
    </a-empty>
    <template v-else>
      <div class="left custom-scroll-bar" ref="left">
        <template v-for="[key, value] in taskList" :key="key">
          <div v-if="showSuccess || value.status !== 0"
          :class="['fr', 'download-item', selected.includes(key) ? 'active' : '']" @click.left.exact="switchItem(key)"
          @click.ctrl.exact="multiSelect(key)" @click.meta.exact="multiSelect(key)" @click.shift.exact="rangeSelect(key)"
          @click.right="showContextmenu()">
            <div class="img fr ac">
              <img :src="value.cover" :alt="value.title">
            </div>
            <div class="content fc jsb">
              <div class="ellipsis-1">{{ value.title }}</div>
              <div>状态：<span class="text-active">{{ formatDownloadStatus(value.status, 'label') }}</span></div>
              <div>
                <a-progress :percent="value.progress" :status="formatDownloadStatus(value.status, 'value')"
                  strokeColor="#fb7299"></a-progress>
              </div>
            </div>
          </div>
          </template>
      </div>
      <div class="right">
        <div class="download-topbar">
          <a-switch checked-children="隐藏已完成" un-checked-children="显示已完成" v-model:checked="showSuccess"></a-switch>
          <a-button name="retryAllFailed" @click="retryAllFailed" type="text" class="ml8 pl0 pr0" v-if="failedTaskList.length !== 0">重试所有失败</a-button>
        </div>
        <template v-if="selected.length > 0 && (showSuccess || rightTask.status !== 0)">
          <div class="image">
            <a-image :src="rightTask.cover" :alt="rightTask.title" />
          </div>
          <div class="pl16 mt8 text-active" @click="openBrowser(rightTask.url)">{{ rightTask.title }}</div>
          <div class="fr ac pl16 mt8 up-list">
            UP：<div v-for="(item, index) in rightTask.up" :key="index" class="mr16">
              <a class="ellipsis-1 up-name" @click="openBrowser(`https://space.bilibili.com/${item.mid}`)">{{ item.name
              }}</a>
            </div>
          </div>
          <div class="mt8 pl16">创建时间：<span class="text-active">{{ dayjs(rightTask.createdTime).format('YYYY-MM-DD HH:mm:ss')
          }}</span></div>
          <div class="mt8 pl16">视频大小：<span class="text-active">{{ formatVideoSize(rightTask.size) }}</span></div>
          <div class="mt8 pl16">视频时长：<span class="text-active">{{ rightTask.duration }}</span></div>
          <div class="mt8 pl16">清晰度：<span class="text-active">{{ formatQuality(rightTask.quality) }}</span></div>
          <div class="mt8 pl16">播放：<span class="text-active">{{ rightTask.view }}</span></div>
          <div class="mt8 pl16">弹幕：<span class="text-active">{{ rightTask.danmaku }}</span></div>
          <div class="mt8 pl16">评论：<span class="text-active">{{ rightTask.reply }}</span></div>
        </template>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import downloadStatus from '../assets/data/status'
import { storeToRefs } from 'pinia'
import { store } from '../store'
import { qualityMap } from '../assets/data/quality'
import { checkUrl, checkUrlRedirect, parseHtml, getDownloadList, addDownload } from '../core/bilibili'
import { sleep } from '../utils'

const route = useRoute()
const { taskList, rightTask, taskListArray, rightTaskId, failedTaskList } = storeToRefs(store.taskStore())
const selected = ref<string[]>([])
const left = ref<any>(null)
const showSuccess = ref(false)

const openBrowser = (url: string) => {
  window.electron.openBrowser(url)
}

const formatDownloadStatus = (status: number, type: string) => {
  return downloadStatus[status ?? 1][type]
}

const formatQuality = (quality: number) => {
  return quality === -1 ? '' : qualityMap[quality]
}

const formatVideoSize = (size: number) => {
  return size === -1 ? '' : `${(size / 1000 / 1000).toFixed(2)}MB`
}

const switchItem = (key: string) => {
  selected.value = [key]
  store.taskStore().setRightTaskId(key)
}

const multiSelect = (key: string) => {
  console.log('multiSelect', key)
  const index = selected.value.indexOf(key)
  if (index !== -1) {
    if (selected.value.length > 1) selected.value.splice(index, 1)
  } else {
    selected.value.push(key)
  }
}

const rangeSelect = (key: string) => {
  let start = taskListArray.value.findIndex(item => item[0] === selected.value[0])
  let end = taskListArray.value.findIndex(item => item[0] === key)
  let cancel = null
  if (start > end) {
    cancel = end
    end = start
    start = cancel
  }
  selected.value = []
  for (let idx = start; idx <= end; idx++) {
    if (showSuccess.value || taskListArray.value[idx][1].status !== 0) {
      selected.value.push(taskListArray.value[idx][0])
    }
  }
}

const showContextmenu = async () => {
  const res = await window.electron.showContextmenu('download')
  console.log(res)
  if (res === 'open') {
    openDir()
  } else if (res === 'delete') {
    deleteVideos()
  } else if (res === 'selectAll') {
    selectAll()
  } else if (res === 'reload') {
    reloadDownload()
  } else if (res === 'retry') {
    retryDownload()
  } else if (res === 'play') {
    playVideo()
  }
}

const playVideo = () => {
  if (rightTask.value.status === 0) {
    window.electron.openPath(rightTask.value.filePathList[0])
  }
}

const reloadDownload = async (retry = false) => {
  console.log('重新下载')
  const { response } = await window.electron.openReloadVideoDialog(selected.value.length)
  // 点击取消
  if (!response) return
  // 获取选中任务数据
  const loading = message.loading('下载中...', 0)
  const selectedTask: any[] = []
  selected.value.forEach(item => {
    const task = store.taskStore().getTask(item)
    if (task) {
      const clonedTask = JSON.parse(JSON.stringify(task))
      clonedTask.curPage = clonedTask.page.find((it: any) => it.cid === clonedTask.cid) ? clonedTask.page.find((it: any) => it.cid === clonedTask.cid).page : 0
      selectedTask.push(clonedTask)
    }
  })
  try {
    for (const key in selectedTask) {
      const item = selectedTask[key]
      if (!item.curPage) continue
      const videoType = checkUrl(item.url)
      const { body, url } = await checkUrlRedirect(item.url)
      const videoInfo = await parseHtml(body, videoType, url)
      if (videoInfo === -1) continue

      store.taskStore().setVideoInfo(videoInfo.bvid, videoInfo)
      const list = await getDownloadList(videoInfo, [item.curPage], item.quality)
      if (retry) {
        console.log(videoInfo, item, list)
        const taskList = [{
          ...item,
          ...list[0],
          status: 1
        }]
        store.taskStore().setTask(taskList)
        window.electron.downloadVideo(taskList[0])
        store.baseStore().addDownloadingTaskCount(1)
      } else {
        // 当前list只会存在一项
        const taskList = await addDownload(list)
        store.taskStore().setTask(taskList)
        // 可以下载
        if (taskList[0].status === 1) {
          window.electron.downloadVideo(taskList[0])
          store.baseStore().addDownloadingTaskCount(1)
        }
      }
      await sleep(300)
    }
  } catch (e) {

  } finally {
    loading()
  }
}

const retryDownload = () => {
  console.log('重试')
  reloadDownload(true)
}

const retryAllFailed = () => {
  console.log('重试所有失败')
  const failedTask = taskListArray.value.filter((item: any) => item[1].status === 5).map((item: any) => item[0])
  let count = 1
  failedTask.forEach((id: string) => {
    if (count < store.settingStore().downloadingMaxSize) {
      selected.value.push(id)
      count += 1
    } else {
      const item = store.taskStore().getTask(id)
      if (item) {
        item.status = 4
        item.progress = 0
        store.taskStore().setTask([JSON.parse(JSON.stringify(item))])
      }
    }
  })
  reloadDownload(true)
}

const openDir = () => {
  window.electron.openDir(toRaw(selected.value))
}

const deleteVideos = async () => {
  const { response, checkboxChecked } = await window.electron.openDeleteVideoDialog(selected.value.length)
  console.log(response, checkboxChecked)
  const filelist: string[] = []
  selected.value.forEach(item => {
    const task = store.taskStore().getTask(item)
    if (task && task.filePathList) {
      if (task.filePathList[4]) {
        filelist.push(task.filePathList[4])
      } else {
        filelist.push(task.filePathList[0], task.filePathList[1], task.filePathList[2], task.filePathList[3])
      }
    }
  })
  // 点击取消
  if (!response) return
  // 删除记录
  store.taskStore().deleteTask(toRaw(selected.value))
  // 删除文件
  if (checkboxChecked) window.electron.deleteVideos(filelist)
  message.success('任务已删除')
  if (taskListArray.value && taskListArray.value[0]) switchItem(taskListArray[0][0])
}

const selectAll = () => {
  selected.value = []
  taskList.value.forEach((value, key) => {
    selected.value.push(key)
  })
}

onMounted(() => {
  if (!rightTaskId.value) return
  switchItem(rightTaskId.value)
  taskListArray.value.forEach((item, index) => {
    if (item[0] === rightTaskId.value && index >= 3) {
      // 滚动
      left.value.scrollTo({
        top: 83 * (index - 2)
      })
    }
  })
  window.electron.on('download-video-status', async ({ id }: { id: string, status: number, progress: number }) => {
    if (selected.value.includes(id)) {
      selected.value.splice(selected.value.indexOf(id), 1)
    }
  })
})

</script>

<style scoped lang="less">
.container {
  box-sizing: border-box;
  padding: 16px;
  position: relative;
  height: calc(100vh - 28px);

  &.bg-fff {
    background: #ffffff;
  }

  .left {
    flex: 5;
    width: 0;
    border-top: 1px solid #eeeeee;
    border-right: 1px solid #eeeeee;
    overflow-y: overlay;

    .download-item {
      border-bottom: 1px solid #eeeeee;
      cursor: pointer;

      &.active {
        background: rgba(251, 114, 153, 0.2);
      }

      .img {
        flex: none;
        width: 106px;
        height: 79px;
        overflow: hidden;
        position: relative;

        img {
          display: block;
          width: 100%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
      }

      .content {
        box-sizing: border-box;
        flex: none;
        width: 364px;
        padding: 8px;
      }
    }
  }

  .right {
    position: relative;
    flex: 3;
    width: 0;

    .image {
      height: 179px;
      overflow: hidden;
      position: relative;

      img {
        display: block;
        width: 100%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
    }

    .operate {
      position: absolute;
      width: 100%;
      bottom: 0px;
      left: 0px;
    }

    .up-list {
      width: 100%;
      overflow-x: scroll;

      &::-webkit-scrollbar {
        display: none;
      }

      .up-name {
        display: block;
        width: 80px;
      }
    }
  }
}

:deep(.ant-progress-status-success .ant-progress-text) {
  color: @primary-color;
}
</style>
