---
title: ".li域名注册教程"
date: 2021-09-25
updated: 2023-10-06
tags: ["分享", "博客"]
categories: ["技术"]
description: "本文记录了在列支敦士登公国注册.li域名，用于个人博客的踩坑过程，仅供参考。"
shelf: eng
oldUrl: "/2021/09/25/li-yu-ming-zhu-ce-jiao-cheng/"
---

### 简要

本文记录了在列支敦士登公国注册.li域名，用于个人博客的踩坑过程，仅供参考。

### 引子

-   为什么要制作独立博客  
    相比较公众号, 知乎专栏, 小密圈等平台，独立博客，因为有属于自己的域名，可以自由的排版，自由地说话。更重要的是，有一种尽在掌握的主人翁感觉。
-   为什么要申请.li域名  
    李是我国的大姓，以.li域名结尾，和自己的姓氏拼音重合，使得域名更简介、更专属。

### metanet注册商

li域名属于列支敦士登公国，是欧洲中部的内陆袖珍国家，处于瑞士与奥地利两国之间，国家语言是德语。注册商为[metanet](https://www.metanet.ch/)  
这家公司有一下几个特点

-   德语
-   不能直接注册，原因是担心占用公共设施资源
-   需要致电座机确认订单

### 注册域名

1.  直接查询域名是否可以注册，例如下图表示woaibeijing.li是可以注册的

![](/posts-media/li-yu-ming-zhu-ce-jiao-cheng/metanet2.webp)

> 2021年9月24日数据：10.75瑞士法郎=75.2876人民币元

2.  然后就是填入各种个人信息，1年、3年、5年期等，注册时间长并没有优惠。
3.  等邮箱接收邮件，得到订单号，有一个坑是，下图这个竖线不是分隔符，是字母I。邮件大意是订单已经收到，我们在24小时的工作时间内反馈。  
    ![](/posts-media/li-yu-ming-zhu-ce-jiao-cheng/metanet3.png)
4.  然后过了两个小时，我收到邮件，说为了避免机器人占用公共设施资源，需要我在工作时间内致电座机号码确认订单，注意比北京晚6个小时
    
    ### skype开通免费瑞士电话
    
    相比较移动、联通运营商的跨国长途电话，skype更便宜。如果是第一次申请的账户，只需要开通PayPal，绑定银联卡，就可以申请一个月免费瑞士拨打套餐100分钟。如果网络慢，有可能需要科学上网。  
    ![](/posts-media/li-yu-ming-zhu-ce-jiao-cheng/skype.jpg)  
    然后接下来就是选择一个对方上班时间电话沟通，需要描述订单号，注意不要漏掉那个I字母

### PayPal

这一步就是需要绑定PayPal自动付款到metanet账户  
然后24小时内自动扣款

### 域名解析

这一步骤和阿里云等其他国内的解析操作差不多。  
选择A（IPv4 address），将域名解析到服务器公网ip上。

### nginx配置

在服务器上配置

```bash
apt update && \
apt install nginx
```

```bash
vim /etc/nginx/sites-enabled/xxx.conf
```

```
limit_req_zone $binary_remote_addr zone=two:10m rate=10r/s;

server {
server_name {填入解析域名};

gzip on;
gzip_min_length 1000;
gzip_types text/plain application/xml application/json text/css application/javascript;

location / {
client_max_body_size 100M;
proxy_set_header Host localhost;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_pass http://127.0.0.1:{填入服务端口号};

}
}
```

```bash
nginx -s reload
```

### ssl加密

-   现在访问网站使用的是`http`，是不安全的，需要申请ssl证书，加密成`https`
    
-   网上很容易申请一年免费的DV型ssl证书，注册成功后把证书拷贝到服务器
    
    -   以国内的[青云](qingcloud.com)为例  
        ![](/posts-media/li-yu-ming-zhu-ce-jiao-cheng/ssl1.webp)
-   修改nginx配置
    
    ```bash
    vim /etc/nginx/sites-enabled/xxx.conf
    ```
    
    ```
    limit_req_zone $binary_remote_addr zone=two:10m rate=10r/s;
    server {
    listen 443 ssl;
    server_name {填入解析域名};
    ssl_certificate {证书.pem目录};
    ssl_certificate_key {证书.key目录};
    gzip on;
    gzip_min_length 1000;
    gzip_types text/plain application/xml application/json text/css application/javascript;
    location / {
    client_max_body_size 100M;
    proxy_set_header Host localhost;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://127.0.0.1:{填入服务端口号};
    }
    }
    ```
    
-   重新加载
    

```bash
nginx -s reload
```

### 感谢参考

-   [李军博客介绍如何开通.li域名](https://jun.li/tech/202.html)
-   [中文独立博客列表](https://github.com/timqian/chinese-independent-blogs)
