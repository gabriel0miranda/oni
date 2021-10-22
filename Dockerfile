FROM debian:buster-20210511
RUN apt-get update && apt-get install -y \
    docker.io \
    docker-compose \
    curl
RUN curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh"  | bash    
RUN mv /kustomize /usr/bin/kustomize
WORKDIR /root
RUN mkdir -p /usr/src/oni
ADD dist/oni /usr/src/oni
RUN chmod +x /usr/src/oni/oni
ENV PATH="/usr/src/oni/:${PATH}"
#ENTRYPOINT [ "oni"]
#CMD ["--help" ]