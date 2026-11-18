---
title: "docker服务镜像瘦身"
date: 2020-12-31
updated: 2023-10-06
tags: ["docker", "server"]
categories: ["技术"]
description: "空间：镜像占满硬盘 时间：拉取镜像缓慢"
shelf: eng
oldUrl: "/2020/12/31/docker-fu-wu-jing-xiang-shou-shen/"
---

## 为什么要压缩瘦身

-   空间：镜像占满硬盘
-   时间：拉取镜像缓慢

## 修改前后的dockerfile

### 先上修改后的dockerfile

```docker
FROM python:3.8-slim

COPY /.build/ft/ /app/
COPY /patch/nltk_data.tar.gz /root/

# 安装python库
RUN echo "==> Install curl and helper tools..."  && \
    apt-get update && \
    apt-get install -y python3-pip curl && \
    pip3 install --no-cache-dir -r /app/requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com && \
    echo "==> Clean up..."  && \
    apt-get clean  && \
    rm -rf /var/lib/apt/lists/*  && \
    cd /root && tar zxvf nltk_data.tar.gz && rm nltk_data.tar.gz && \
    apt-get remove --auto-remove -y python3-pip
    
# 复制脚本
COPY /deploy/util/ /app/deploy/util/
COPY /deploy/healthcheck.sh /app/deploy/healthcheck.sh
COPY /src/base.py /app/src/base.py
COPY /deploy/config.py /app/deploy/config.py
COPY /deploy/ft_main.py /app/deploy/ft_main.py
COPY /deploy/ft_route.py /app/deploy/ft_route.py
COPY /deploy/ft_model.py /app/deploy/ft_model.py
COPY /src/ft/ /app/src/ft/
COPY /utils/ /app/utils/
COPY /patch/dispatcher.py /usr/local/lib/python3.8/site-packages/ml_platform_client/dispatcher.py

# 编译py脚本至pyc，并删除py脚本
RUN  python3 -m compileall -b /app/ && \
    find /app/ -name '*.py' -delete

# 环境变量
ENV TZ Asia/Shanghai
ENV HEALTHCHECK_PORT 12371

# 健康检查
HEALTHCHECK --interval=60s --timeout=10s --retries=3 --start-period=10s \
    CMD sh /app/deploy/healthcheck.sh

# 运行
CMD ["python3", "app/deploy/ft_main.pyc"]
```

### 再上修改前的dockerfile

```docker
FROM python:3.8

COPY /.build/ft/ /app/
# Install any needed packages specified in requirements.txt
RUN pip install --upgrade pip -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com
RUN pip install -r app/requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com

# Copy the current directory contents into the container at /app
COPY /deploy/util/ /app/deploy/util/
COPY /src/base.py /app/src/base.py
COPY /deploy/config.py /app/deploy/config.py
COPY /deploy/ft_main.py /app/deploy/ft_main.py
COPY /deploy/ft_route.py /app/deploy/ft_route.py
COPY /deploy/ft_model.py /app/deploy/ft_model.py
COPY /src/ft/ /app/src/ft/
COPY /src/ft/pre_trained_models/1600917656653_all_poc/1600917656653_all_poc.vec /app/src/ft/pre_trained_models/1600917656653_all_poc/1600917656653_all_poc.vec
COPY /patch/nltk_data.tar.gz /root/
COPY /utils/ /app/utils/

# download nltk model
RUN pip install nltk==3.5
RUN cd /root && tar zxvf nltk_data.tar.gz

COPY /patch/dispatcher.py /usr/local/lib/python3.8/site-packages/ml_platform_client/dispatcher.py
# Define environment variable
ENV TZ Asia/Shanghai

# Run app.py when the container launche
CMD ["python", "app/deploy/ft_main.py"]
```

镜像打包下来,一个是369MB，一个是1.16GB，差了3倍。

![](/posts-media/docker-fu-wu-jing-xiang-shou-shen/docker_image.png)

## 压缩研究过程

-   镜像base的选择
-   pip不必要的安装
-   docker系统不必要的安装
-   不必要依赖的卸载
-   docker layer 优化
-   残留文件的删除
-   .dockerignore

### 镜像base的选择

#### 资源

-   [dockerhub](https://hub.docker.com/)
-   [harbor.emotibot.com](https://harbor.emotibot.com/harbor/projects)
-   联系运维制作@郭鹤阳

#### 常见base

-   python
-   centos
-   aliphe
-   debian
-   ubuntu

```bash
REPOSITORY          TAG                 IMAGE ID            CREATED             SIZE
python              3.8                 f5041c8ae6b1        7 days ago          884.0MB
alpine              latest              389fef711851        13 days ago         5.58MB
debian              latest              6d6b00c22231        2 weeks ago         114.0MB
centos              latest              300e315adb2f        3 weeks ago         209.0MB
ubuntu              20.04               f643c72bc252        4 weeks ago         72.9MB
ubuntu              18.04               2c047404e52d        4 weeks ago         63.3MB
python              3.8-slim            4fab6f68e9f0        7 days ago          115MB
```

### pip不必要的安装

-   检查冗余python库的安装
    
    ```docker
    RUN pip install -r requirements.txt
    ```
    
    检查发现requirements.txt有几个历史遗留的不用的python库，于是去除
-   不留缓存数据
    
    ```DOCKERFILE
    RUN pip install --no-cache-dir -r requirements.txt
    ```
    

### docker系统不必要的安装

直接用python:3.8作base，镜像内安装了许多不必要的库，所以镜像多大884MB，不推荐使用。

那么其他base镜像都需要手动安装python和pip，但是安装的过程有可能会自动安装额外的库，以**ubuntu**的base的apt安装为例

```docker
FROM ubuntu:20.04 # 72.9MB
RUN apt-get update # 99.2MB
RUN apt-get install -y python3.8 # 138MB
RUN apt-get install -y python3-pip # 394MB
```

检查 apt-get install python3-pip 时安装了许多额外的包，所以镜像空间从138MB涨至394MB  
![](/posts-media/docker-fu-wu-jing-xiang-shou-shen/python3-dev.png)

改代码为：

```docker
RUN apt-get install -y --no-install-recommends python3-pip
```

发现pip安装编译fasttext、pandas时又通不过，显示编译c++版本不够  
于是改为：

```docker
RUN apt-get install -y --no-install-recommends python3-pip gcc
```

但是依然出现奇怪的编译错误问题，看来一定要安装，从python3-pip库推荐的其他依赖库

### 不必要依赖的卸载

查资料后发现，安装完所有的编译依赖，编译完fasttext、pandas后，再卸载掉依赖也可以释放掉镜像空间，于是尝试

```docker
FROM ubuntu:20.04 # 72.9MB
RUN apt-get update # 99.2MB
RUN apt-get install -y python3.8 # 138MB
RUN apt-get install -y python3-pip
RUN pip install --upgrade pip -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com
RUN pip install -r app/requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com
RUN apt-get remove -y python3-pip
```

发现镜像空间几乎没有减掉多少，肯定是推荐装的依赖没有卸载掉，于是最后一行改为

```DOCKERFILE
RUN apt-get remove --auto-remove -y python3-pip
```

发现这次是卸载掉了大部分依赖，但是python3命令失效，原来–auto-remove把python也卸载掉了

那么把以上执行时，终端里显示安装的依赖，复制过来定向卸载,最后一行改为：

```DOCKERFILE
RUN apt-get remove -y binutils binutils-common binutils-x86-64-linux-gnu cpp cpp-9 dirmngr dpkg-dev fakeroot g++ g++-9 gcc gnupg gnupg-l10n gnupg-utils gpg gpg-agent gpgconf gpgsm  libalgorithm-merge-perl libasan5 libatomic1 libbinutils libc-dev-bin libc6-dev libctf-nobfd0 libctf0 libdpkg-perl libexpat1-dev libgcc-9-dev libgdbm-compat4 libhcrypto4-heimdal libhx509-5-heimdal libisl22 libitm1 libldap-2.4-2 libldap-common liblocale-gettext-perl libmpfr6 libnpth0 libperl5.30 libpython3-dev libpython3.8-dev libquadmath0 libroken18-heimdal libsasl2-modules-db libstdc++-9-dev libtsan0 linux-libc-dev make manpages manpages-dev netbase perl perl-modules-5.30 pinentry-curses python-pip-whl python3-distutils python3-lib2to3 python3-minimal python3-setuptools python3-wheel zlib1g-dev
```

发现python3命令还是失效，还是不可避免卸载掉了不该卸载的依赖,所以以ubuntu的base的build时，卸载问题依然没有有效解决。

#### 尝试用其他镜像

尝试用alpine镜像安装，发现fasttext、pandas编译的速度非常慢，build经常要在10分钟以上，再加上看[帖子](https://pythonspeed.com/articles/base-image-python-docker-images/)说，跑python程序不建议alpine,建议python:3.8-slim（基于ubuntu）

于是考虑，ubuntu:20.04的base安装python后的镜像大小**138MB**，而python:3.8-slim镜像只有**115MB**，所以python:3.8-slim镜像更小。

尝试后发现在python:3.8-slim中执行

```DOCKERFILE
RUN apt-get remove --auto-remove -y python3-pip
```

不会卸载镜像base自带的python，所以采用了该镜像base

此时镜像大小**652MB**

### docker layer 优化

看到[资料](https://www.replicated.com/blog/refactoring-a-dockerfile-for-image-size/)说,docker的layer类似于git的commit，会缓存镜像每一个layer的中间状态，所以要**把安装和卸载的操作放在一个层内操作**，可以节省镜像空间。即，一个RUN把安装和卸载都完成，改代码如下：

```docker
RUN echo "==> Install curl and helper tools..."  && \
    apt-get update && \
    apt-get install -y python3-pip curl && \
    pip3 install --no-cache-dir -r /app/requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com && \
    echo "==> Clean up..."  && \
    cd /root && tar zxvf nltk_data.tar.gz && rm nltk_data.tar.gz && \
    apt-get remove --auto-remove -y python3-pip
```

-   发现镜像从652MB压缩至405MB

```bash
REPOSITORY          TAG       IMAGE ID        CREATED             SIZE
multi-layers        latest    00c97e1d7933    8 minutes ago       652MB
one-layer           latest    7ad697548da4    5 minutes ago       405MB
```

#### docker history查看

用该命令查看镜像的每一层占空间

```bash
sudo docker history one-layer
```

```
IMAGE               CREATED             CREATED BY                                      SIZE                COMMENT
7ad697548da4        About an hour ago   /bin/sh -c #(nop)  CMD ["python3" "app/deplo…   0B
e9386cca0855        About an hour ago   /bin/sh -c #(nop)  HEALTHCHECK &{["CMD-SHELL…   0B
5ae5ec8aaf10        About an hour ago   /bin/sh -c #(nop)  ENV HEALTHCHECK_PORT=12371   0B
3fd0a931247a        About an hour ago   /bin/sh -c #(nop)  ENV TZ=Asia/Shanghai         0B
7468321ded7b        About an hour ago   /bin/sh -c #(nop) COPY file:6c30438cfb19023d…   6kB
e2fdbd36a00f        About an hour ago   /bin/sh -c #(nop) COPY dir:3c8d27aabd1cb86bd…   15.2kB
cf7ac213a678        About an hour ago   /bin/sh -c #(nop) COPY dir:facf049dd19d1bb42…   5.22MB
ecd6ace9ed35        About an hour ago   /bin/sh -c #(nop) COPY file:71a559ed26e6c1b1…   614B
ac5767505d28        About an hour ago   /bin/sh -c #(nop) COPY file:a4c26af57d222ea2…   4.09kB
e78be3692ec4        About an hour ago   /bin/sh -c #(nop) COPY file:ddb0a10031b574f5…   558B
3c038be5baea        About an hour ago   /bin/sh -c #(nop) COPY file:6b61b654335fdb40…   2.4kB
6c1f6603e986        About an hour ago   /bin/sh -c #(nop) COPY file:3576639c2f303274…   6.12kB
ebd89369eb81        About an hour ago   /bin/sh -c #(nop) COPY file:4dc24ca256902d1a…   237B
2bea3714f798        About an hour ago   /bin/sh -c #(nop) COPY dir:7328b421ff9b83bdb…   30.5kB
cf3f29f1c611        About an hour ago   /bin/sh -c echo "==> Install curl and helper…   273MB
40b96e8c1b2a        About an hour ago   /bin/sh -c #(nop) COPY file:098abc795c85c5c1…   27MB
8b71889b46f6        About an hour ago   /bin/sh -c #(nop) COPY dir:c07c34d6096fcadb8…   1.7kB
f643c72bc252        4 weeks ago         /bin/sh -c #(nop)  CMD ["/bin/bash"]            0B
<missing>           4 weeks ago         /bin/sh -c mkdir -p /run/systemd && echo 'do…   7B
<missing>           4 weeks ago         /bin/sh -c [ -z "$(apt-get indextargets)" ]     0B
<missing>           4 weeks ago         /bin/sh -c set -xe   && echo '#!/bin/sh' > /…   811B
<missing>           4 weeks ago         /bin/sh -c #(nop) ADD file:4f15c4475fbafb3fe…   72.9MB
```

```bash
sudo docker history multi-layers
```

```
IMAGE               CREATED             CREATED BY                                      SIZE                COMMENT
00c97e1d7933        About an hour ago   /bin/sh -c #(nop)  CMD ["python3" "app/deplo…   0B
064053392798        About an hour ago   /bin/sh -c #(nop)  HEALTHCHECK &{["CMD-SHELL…   0B
c3e4180cf2e9        About an hour ago   /bin/sh -c #(nop)  ENV HEALTHCHECK_PORT=12371   0B
a9302c0f50a4        About an hour ago   /bin/sh -c #(nop)  ENV TZ=Asia/Shanghai         0B
5957407a9779        About an hour ago   /bin/sh -c #(nop) COPY file:6c30438cfb19023d…   6kB
64fb13b061e8        About an hour ago   /bin/sh -c #(nop) COPY dir:3c8d27aabd1cb86bd…   15.2kB
175ab820c3e1        About an hour ago   /bin/sh -c #(nop) COPY dir:facf049dd19d1bb42…   5.22MB
7c536696cd51        About an hour ago   /bin/sh -c #(nop) COPY file:71a559ed26e6c1b1…   614B
d417ea94eb24        About an hour ago   /bin/sh -c #(nop) COPY file:a4c26af57d222ea2…   4.09kB
5066c036b62e        About an hour ago   /bin/sh -c #(nop) COPY file:ddb0a10031b574f5…   558B
c13f460771b7        About an hour ago   /bin/sh -c #(nop) COPY file:6b61b654335fdb40…   2.4kB
6b8f6a0ba402        About an hour ago   /bin/sh -c #(nop) COPY file:3576639c2f303274…   6.12kB
95061bf8baf2        About an hour ago   /bin/sh -c #(nop) COPY file:4dc24ca256902d1a…   237B
fd0bac8c6a44        About an hour ago   /bin/sh -c #(nop) COPY dir:7328b421ff9b83bdb…   30.5kB
cdeae23b505a        About an hour ago   /bin/sh -c apt-get remove -y binutils binuti…   1.16MB
8f2a2dc5bb06        About an hour ago   /bin/sh -c cd /root && tar zxvf nltk_data.ta…   79.3MB
7105f44ee7a5        About an hour ago   /bin/sh -c echo "==> Clean up..."               0B
773afa16a029        About an hour ago   /bin/sh -c pip3 install --no-cache-dir -r /a…   142MB
5e17620bcf7d        About an hour ago   /bin/sh -c apt-get install -y python3-pip cu…   299MB
13d094d18055        About an hour ago   /bin/sh -c apt-get update                       26.3MB
d7c871039653        About an hour ago   /bin/sh -c echo "==> Install curl and helper…   0B
40b96e8c1b2a        About an hour ago   /bin/sh -c #(nop) COPY file:098abc795c85c5c1…   27MB
8b71889b46f6        About an hour ago   /bin/sh -c #(nop) COPY dir:c07c34d6096fcadb8…   1.7kB
f643c72bc252        4 weeks ago         /bin/sh -c #(nop)  CMD ["/bin/bash"]            0B
<missing>           4 weeks ago         /bin/sh -c mkdir -p /run/systemd && echo 'do…   7B
<missing>           4 weeks ago         /bin/sh -c [ -z "$(apt-get indextargets)" ]     0B
<missing>           4 weeks ago         /bin/sh -c set -xe   && echo '#!/bin/sh' > /…   811B
<missing>           4 weeks ago         /bin/sh -c #(nop) ADD file:4f15c4475fbafb3fe…   72.9MB
```

对比发现：

-   one-layer镜像的**cf3f29f1c611**层，完成了安装和卸载的工作，占用**273MB**；
-   multi-layers镜像的**5e17620bcf7d**、**773afa16a029**、**8f2a2dc5bb06**、**cdeae23b505a**四个层完成了安装和卸载，占用299MB+142MB+79MB+1MB=**521MB**；
-   其他COPY程序脚本的操作占空间都是KB量级，可以忽略不计。

结论：

1.  要把安装卸载都放在一个层内
2.  COPY操作不放在一层也没关系

### 残留文件的删除

在同一个RUN命令中再加入

```docker
apt-get clean
rm -rf /var/lib/apt/lists/*
```

-   发现镜像从405MB压缩至369MB
    
    ```bash
    REPOSITORY          TAG       IMAGE ID        CREATED             SIZE
    one-layer           latest    00c97e1d7933    8 minutes ago       405MB
    one-layer-clean     latest    7ad697548da4    5 minutes ago       369MB
    ```
    

### .dockerignore

最后要注意编写.dockerignore，忽略寄主环境的build目录中，docker镜像不需要考虑的脚本或文件。

[https://www.replicated.com/blog/refactoring-a-dockerfile-for-image-size/](https://www.replicated.com/blog/refactoring-a-dockerfile-for-image-size/)
