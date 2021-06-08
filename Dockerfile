FROM debian:buster-20210511
RUN apt-get update && apt-get install -y \
    docker.io \
    docker-compose 
WORKDIR /root
RUN mkdir -p /usr/src/oni
ADD dist/oni /usr/src/oni
RUN chmod +x /usr/src/oni/oni
ENV PATH="/usr/src/oni/:${PATH}"
ENTRYPOINT [ "oni"]
CMD ["--help" ]