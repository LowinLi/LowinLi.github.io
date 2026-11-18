---
title: "python服务镜像编译so"
date: 2021-03-18
updated: 2026-01-03
tags: ["docker", "安全", "编译"]
categories: ["技术"]
description: "源码安全： 1. 当服务部署后，别人很容易进入docker容器内部，对你的py脚本一览无余。 2. 即使py脚本编译pyc再部署，也是可以很"
shelf: eng
oldUrl: "/2021/03/18/python-fu-wu-jing-xiang-bian-yi-so/"
---

## 为什么要编译so

-   源码安全：
    1.  当服务部署后，别人很容易进入docker容器内部，对你的py脚本一览无余。
    2.  即使py脚本编译pyc再部署，也是可以很轻易反编译的。但是若编译成so文件，反编译成本就非常高了。

## 什么是so文件

Unix系統下的动态库文件

## 修改编译前的样子

### 路径

假如容器内的路径是这样的

```
/
├── app
│   ├── main.py
│   └── src
|       ├── __init__.py
│       ├── aaa.py
│       ├── bbb.py
│       └── utils
│            ├── __init__.py
│            ├── ccc.py
│            ├── ddd.py
...
```

-   `src目录`下的所有脚本并不想让别人看到

### 修改前的dockerfile

```docker
FROM python:3.8-slim

COPY docker/requirements.txt /app/

RUN echo "==> Install..."  && \
    apt-get update && \
    apt-get install -y python3-pip&& \
    pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r /app/requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com && \
    echo "==> Clean up..."  && \
    apt-get clean  && \
    rm -rf /var/lib/apt/lists/*  && \
    apt-get remove --auto-remove -y python3-pip

COPY /src /app/src
COPY /main.py /app/main.py

WORKDIR /app/
CMD ["python3", "main.py"]
```

至于为什么`RUN`命令这么长，建议查看另一篇帖子[docker服务镜像瘦身](https://zhuanlan.zhihu.com/p/341011419)。

## 解决方案

### 修改后dockerfile的样子

```docker
FROM python:3.8-slim

COPY docker/requirements.txt /app/

RUN echo "==> Install..."  && \
    apt-get update && \
    apt-get install -y python3-pip libgomp1 gcc && \        # 编译.so文件需要安装c+编译器
    pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r /app/requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com && \
    pip3 install Cython==0.29.22  && \      # 安装Cython，编译需要的库
    echo "==> Clean up..."  && \
    apt-get clean  && \
    rm -rf /var/lib/apt/lists/*  && \
    apt-get remove --auto-remove -y python3-pip

COPY /src /app/src
COPY /main.py /app/main.py

COPY setup.py /app/             # 拷贝准备好的setup.py进入镜像内
RUN cd /app/ && \
    python3 setup.py build_ext && \                # 开始编译
    cp -r build/lib.linux-x86_64-3.8/src .  && \   # 拷贝编译好的so文件至对应的路径位置
    find . -type f -name "*.py" ! -path "/app/main.py" && \ # python程序入口脚本不编译，其他py脚本全删除
    rm -r build     # 删除编译过程中的额外文件

WORKDIR /app/
CMD ["python3", "main.py"]
```

这里面的setup.py脚本见下方：

### 打包设置

-   预先写好打包setup.py脚本
    
    ```python
    from setuptools import setup
    from setuptools.extension import Extension
    
    from Cython.Build import cythonize
    from Cython.Distutils import build_ext
    
    setup(
        name="yourName",
        ext_modules=cythonize(
            [
                Extension("*", ["src/*.py"]),
                Extension("*", ["src/*/*.py"])  # 有几级目录就要多谢几个’/*‘
            ],
            build_dir="build",
            compiler_directives=dict(always_allow_keywords=True),
            language_level="3",
        ),
        cmdclass=dict(build_ext=build_ext),
        packages=[],
    )
    ```
    

至此，部署服务后，可以睡稳觉了。

### 注意事项

-   每个目录下必须要有\_\_init\_\_.py脚本
