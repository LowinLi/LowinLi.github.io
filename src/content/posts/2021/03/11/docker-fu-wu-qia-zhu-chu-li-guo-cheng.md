---
title: "开发环境docker服务卡住的处理过程记录"
date: 2021-03-11
updated: 2021-09-25
tags: ["docker", "server"]
categories: ["技术"]
description: "在docker容器很多的服务器上，一次性关掉所有服务时经常因为一些进程卡住等奇怪的问题，把docker服务卡住，本文记录了一个暴力的方式清理"
shelf: eng
oldUrl: "/2021/03/11/docker-fu-wu-qia-zhu-chu-li-guo-cheng/"
---

### 简要

在docker容器很多的服务器上，一次性关掉所有服务时经常因为一些进程卡住等奇怪的问题，把docker服务卡住，本文记录了一个暴力的方式清理docker容器的方法

### docker服务卡住处理过程

#### 1\. 关闭所有docker容器时出现个别容器关不掉

尝试以下命令都会卡主

```bash
docker stop xxx
docker kill xxx
docker rm -f xxx
```

卡住1小时没反应，只能ctrl+c

#### 2\. 重启docker服务

```
sudo systemctl stop docker
sudo systemctl start docker
```

启动docker服务时卡住没反应，只能ctrl+c

#### 3\. 重启机器再启docker服务

```
sudo reboot
```

等3分钟再连接服务器

```
sudo systemctl start docker
```

启动docker服务依然卡住没反应，只能ctrl+c

#### 4\. 重装docker服务

```bash
sudo yum -y remove docker docker-common docker-selinux docker-engine
sudo yum -y install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
```

启动docker服务还是卡住

#### 5\. 删除之前没有正常关闭的docker container

```bash
sudo yum -y remove docker docker-common docker-selinux docker-engine
sudo rm -rf /var/lib/docker
sudo rm -rf /var/run/docker
```

提示

```
无法删除docker目录（rm: 无法删除"/var/lib/docker/overlay/XXXXXXXXXXXXXX/merged": 设备或资源忙）
```

#### 6\. 取消挂载

```
cat /proc/mounts |grep "docker"
```

显示

```
/dev/mapper/centos-root /var/lib/docker/overlay xfs rw,seclabel,relatime,attr2,inode64,noquota 0 0
overlay /var/lib/docker/overlay/xxxxxxxxxx
```

输入取消挂载

```
umount /var/lib/docker/overlay/xxxxxxxxxxx
```

或者直接批量操作

```
sudo umount `cat /proc/mounts |grep "docker"|awk '{print $2}'`
```

#### 7\. 再次安装成功

```bash
sudo rm -rf /var/lib/docker
sudo rm -rf /var/run/docker
sudo yum -y install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
```

#### 参考资料

[https://www.bswen.com/2020/12/others-docker-hang.html](https://www.bswen.com/2020/12/others-docker-hang.html)

[https://forums.docker.com/t/what-to-do-when-all-docker-commands-hang/28103/2](https://forums.docker.com/t/what-to-do-when-all-docker-commands-hang/28103/2)

[https://blog.csdn.net/u013355826/article/details/82872073?utm\_medium=distribute.pc\_relevant.none-task-blog-BlogCommendFromMachineLearnPai2-1.control&dist\_request\_id=1328627.21283.16154315419035297&depth\_1-utm\_source=distribute.pc\_relevant.none-task-blog-BlogCommendFromMachineLearnPai2-1.control](https://blog.csdn.net/u013355826/article/details/82872073?utm_medium=distribute.pc_relevant.none-task-blog-BlogCommendFromMachineLearnPai2-1.control&dist_request_id=1328627.21283.16154315419035297&depth_1-utm_source=distribute.pc_relevant.none-task-blog-BlogCommendFromMachineLearnPai2-1.control)
